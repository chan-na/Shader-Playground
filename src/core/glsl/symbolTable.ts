/**
 * Lightweight GLSL symbol table for editor LSP-like features (Phase 25).
 *
 * Parses a single shader source string into a flat list of declarations —
 * uniforms, ins/outs/varyings/attributes, consts, function declarations,
 * function parameters, struct declarations, and local variables inside
 * function bodies. The parser is intentionally regex- and brace-walk-based
 * (no full lexer/AST): it covers the patterns the playground's shaders use
 * and gracefully ignores anything it doesn't understand instead of throwing.
 *
 * Consumers:
 *   - autocomplete (`ui/CodeEditor/autocomplete.ts`) — in-scope locals plus
 *     file-level symbols.
 *   - hover (`ui/CodeEditor/hover.ts`) — resolve the identifier under the
 *     cursor to its declaration metadata.
 *
 * Not goals: full validation (the OffscreenCanvas worker handles that),
 * preprocessor expansion, type inference, or scope shadow resolution beyond
 * "global vs. function body".
 */

// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + regex captures with documented length guards

// One union literal kept inline on `GlslSymbol.kind` — exporting it as a named
// alias used to land in knip's "unused export" report (consumers always read
// the field through `GlslSymbol`, never the alias).
type GlslSymbolKind =
  | "uniform"
  | "in"
  | "out"
  | "attribute"
  | "varying"
  | "const"
  | "local"
  | "parameter"
  | "function"
  | "struct";

export interface GlslSymbol {
  name: string;
  /** Declared type — `"vec3"`, `"sampler2D"`, or `"void"` for void functions. */
  type: string;
  kind: GlslSymbolKind;
  /** 1-based line number of the declaration. */
  line: number;
  /** 1-based column number of the identifier within the line. */
  column: number;
  /**
   * Containing function name, or `null` for top-level declarations. Locals and
   * parameters carry the enclosing function's name here.
   */
  scope: string | null;
  /**
   * For functions: a parameter list rendered as `"vec3 p, float k"` (without
   * the surrounding parens). For variables, undefined.
   */
  parameters?: string;
}

export interface SymbolTable {
  symbols: GlslSymbol[];
}

// Storage-qualifier keywords mapped onto the symbol kind. Each is a top-level
// declaration like `<qualifier> [<precision>]? <type> <name>(\[N\])?;`.
const STORAGE_QUALIFIERS: Record<string, GlslSymbolKind> = {
  uniform: "uniform",
  in: "in",
  out: "out",
  attribute: "attribute",
  varying: "varying",
  const: "const",
};

const IDENT_TOKEN = /[A-Za-z_][\w]*/;

const RE_STORAGE_DECL =
  /^\s*(uniform|in|out|attribute|varying|const)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[\d+\])?\s*(?:=\s*[^;]+)?;/;
// Local variable declaration inside a function body. Allows a precision
// qualifier and an optional initializer expression but stops at the first
// `,` or `;` so multi-decl shorthand (`float x = 0.0, y = 1.0;`) leaves the
// `, y = ...` tail for the comma-walker below to harvest. Because `[^,;]+`
// stops at the first comma, an initializer with a call (`= mix(a, b, t)`)
// matches with a comma *inside* the parens; the walker guards against that
// with bracketDepth()/splitTopLevelDeclarators() so call args aren't harvested
// as phantom locals.
const RE_LOCAL_DECL =
  /^\s*(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[\d+\])?\s*(?:=\s*[^,;]+)?\s*([,;])/;

/** Net bracket depth of `s` — positive if it leaves ()/[]/{} open. */
function bracketDepth(s: string): number {
  let d = 0;
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
  }
  return d;
}

/**
 * Split a declaration tail (`, b = mix(x, y), c;`) into declarator segments at
 * brace/paren depth-0 commas, stopping at the depth-0 semicolon. Commas nested
 * inside a function-call / array initializer are NOT separators, so
 * `vec3 c = mix(a, b, t);` yields no extra declarators (b/t are call args).
 */
function splitTopLevelDeclarators(tail: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let seg = "";
  for (const ch of tail) {
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      seg += ch;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      seg += ch;
    } else if (depth === 0 && ch === ";") {
      out.push(seg);
      return out;
    } else if (depth === 0 && ch === ",") {
      out.push(seg);
      seg = "";
    } else {
      seg += ch;
    }
  }
  if (seg.trim()) out.push(seg);
  return out;
}
const RE_STRUCT = /^\s*struct\s+([A-Za-z_][\w]*)\s*\{/;
// Function declaration header: `<returnType> <name>(<params>) [const]? {`.
// We require the trailing `{` on the same line — multi-line headers are rare
// in playground shaders and would only cost us a few missed declarations.
const RE_FUNCTION_HEADER =
  /^\s*(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*\{/;

// GLSL flow-control keywords that share the `keyword(...)` shape — must not be
// mistaken for function declarations.
const NOT_A_FUNCTION = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "return",
  "case",
]);

/**
 * Strip block comments (`/* ... *​/`) while preserving newlines so line and
 * column numbers stay aligned with the original source. Line comments are
 * left intact and handled per-line by the walkers below.
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Drop everything from `//` to end-of-line. Returns the trimmed line plus its
 * original length so callers can map identifier offsets back to source
 * columns; the comment portion is replaced with spaces so character indices
 * up to the comment remain identical.
 */
function stripLineComment(line: string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return line;
  return line.slice(0, idx);
}

/**
 * Splits a function-parameter list (without surrounding parens) into
 * individual `{ qualifier?, type, name }` entries. Empty or `void` lists yield
 * an empty array. Default-value initializers are not supported by GLSL ES so
 * we don't attempt to parse them.
 */
export function parseFunctionParameters(
  list: string,
): Array<{ type: string; name: string }> {
  const trimmed = list.trim();
  if (!trimmed || trimmed === "void") return [];
  const out: Array<{ type: string; name: string }> = [];
  for (const raw of trimmed.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    // Strip leading qualifiers (`in` / `out` / `inout` / precision).
    const m =
      /^(?:(?:in|out|inout)\s+)?(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[\d+\])?\s*$/.exec(
        part,
      );
    if (!m) continue;
    out.push({ type: m[1]!, name: m[2]! });
  }
  return out;
}

/**
 * Returns a parameter list rendered back to its canonical `"type name, type
 * name"` form (no surrounding parens). Used as the `parameters` field on
 * function symbols for hover / autocomplete `detail`.
 */
function formatParameters(
  params: Array<{ type: string; name: string }>,
): string {
  return params.map((p) => `${p.type} ${p.name}`).join(", ");
}

/**
 * Build the per-source symbol table.
 *
 * Algorithm sketch (line-oriented walker with brace-depth tracking):
 *   1. Strip block comments (replace with spaces, preserve newlines).
 *   2. Walk lines top-to-bottom maintaining a brace-depth counter and the
 *      name of the function we're currently inside (only one level deep —
 *      GLSL has no nested function declarations).
 *   3. At depth 0: match storage-qualifier declarations, struct heads,
 *      function headers.
 *   4. At depth > 0 inside a function: match local-variable declarations
 *      (single + comma-chained shorthand).
 *   5. Track depth by counting braces in the post-comment-stripped line so
 *      `{` inside strings or comments doesn't confuse us (GLSL has no
 *      strings; comments are stripped before counting).
 */
export function buildSymbolTable(source: string): SymbolTable {
  const noBlock = stripBlockComments(source);
  const lines = noBlock.split(/\r?\n/);
  const symbols: GlslSymbol[] = [];

  let depth = 0;
  let currentFn: string | null = null;
  // When > 0 inside a struct body — we don't index struct members yet but we
  // must not treat them as locals.
  let structDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const code = stripLineComment(raw);
    const lineNo = i + 1;

    // Handle declarations BEFORE updating depth so a function header on this
    // line is recorded at the outer scope, and locals inside the function
    // body (which start the line AFTER `{`) land at depth >= 1.
    if (depth === 0 && structDepth === 0) {
      // Storage-qualifier (uniform/in/out/attribute/varying/const).
      const sm = RE_STORAGE_DECL.exec(code);
      if (sm) {
        const kind = STORAGE_QUALIFIERS[sm[1]!]!;
        const type = sm[2]!;
        const name = sm[3]!;
        const col = code.indexOf(name, code.indexOf(type) + type.length) + 1;
        symbols.push({
          name,
          type,
          kind,
          line: lineNo,
          column: col,
          scope: null,
        });
        // fall through — counting braces below is still cheap and harmless.
      } else {
        const stm = RE_STRUCT.exec(code);
        if (stm) {
          const name = stm[1]!;
          const col = code.indexOf(name, code.indexOf("struct") + 6) + 1;
          symbols.push({
            name,
            type: "struct",
            kind: "struct",
            line: lineNo,
            column: col,
            scope: null,
          });
          structDepth += 1;
          // Count remaining braces on this line below.
        } else {
          const fm = RE_FUNCTION_HEADER.exec(code);
          if (
            fm &&
            !NOT_A_FUNCTION.has(fm[1]!) &&
            !NOT_A_FUNCTION.has(fm[2]!)
          ) {
            const returnType = fm[1]!;
            const name = fm[2]!;
            const paramsRaw = fm[3]!;
            const params = parseFunctionParameters(paramsRaw);
            const col =
              code.indexOf(name, code.indexOf(returnType) + returnType.length) +
              1;
            symbols.push({
              name,
              type: returnType,
              kind: "function",
              line: lineNo,
              column: col,
              scope: null,
              parameters: formatParameters(params),
            });
            // Parameters belong inside the function body. They share the
            // header's line/column for go-to purposes (we don't attempt to
            // compute parameter offsets).
            for (const p of params) {
              const pCol = code.indexOf(p.name, code.indexOf("(") + 1);
              symbols.push({
                name: p.name,
                type: p.type,
                kind: "parameter",
                line: lineNo,
                column: pCol >= 0 ? pCol + 1 : col,
                scope: name,
              });
            }
            // Enter the function body. Braces on this line are counted below.
            currentFn = name;
          }
        }
      }
    } else if (depth >= 1 && currentFn && structDepth === 0) {
      // Local variable declaration inside a function body. The first capture
      // is the type, the second the first declared name. We then look for
      // comma-separated extras of the form `, <name>(=...)?` on the same
      // logical declaration before the terminating `;`.
      const lm = RE_LOCAL_DECL.exec(code);
      if (lm) {
        const type = lm[1]!;
        // Filter out keywords that share the storage shape — `return`,
        // `discard`, `if`, etc., would all be mis-matched as locals.
        if (
          !NOT_A_FUNCTION.has(type) &&
          // Storage qualifiers shouldn't appear inside a body either; they'd
          // be parse errors but we'd rather not surface them as symbols.
          !STORAGE_QUALIFIERS[type]
        ) {
          const firstName = lm[2]!;
          const firstCol =
            code.indexOf(firstName, code.indexOf(type) + type.length) + 1;
          symbols.push({
            name: firstName,
            type,
            kind: "local",
            line: lineNo,
            column: firstCol,
            scope: currentFn,
          });
          // If the terminator was `,`, walk forward and collect additional
          // declarators until the semicolon (`vec3 a, b = vec3(0);`). But only
          // when that comma is a real separator: the regex's `[^,;]+` stops at
          // the FIRST comma, which for `vec3 c = mix(a, b, t);` sits *inside*
          // the initializer call (unbalanced `(`), so bracketDepth(lm[0]) > 0 —
          // there are no extra declarators, only call arguments.
          if (lm[3] === "," && bracketDepth(lm[0]) === 0) {
            const tail = code.slice(lm[0].length);
            let cursor = code.indexOf(lm[0]) + lm[0].length;
            for (const declarator of splitTopLevelDeclarators(tail)) {
              const m2 = IDENT_TOKEN.exec(declarator);
              if (!m2) continue;
              const idx = code.indexOf(m2[0], cursor);
              if (idx < 0) continue;
              symbols.push({
                name: m2[0],
                type,
                kind: "local",
                line: lineNo,
                column: idx + 1,
                scope: currentFn,
              });
              cursor = idx + m2[0].length;
            }
          }
        }
      }

      // Loop-variable declaration (`for (int i = 0; ...`). We detect it by
      // matching anywhere on the line — a for-init is itself a single decl.
      const fl =
        /for\s*\(\s*(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*=/.exec(
          code,
        );
      if (fl && !NOT_A_FUNCTION.has(fl[1]!)) {
        const type = fl[1]!;
        const name = fl[2]!;
        // Avoid double-adding the same line/name combination that already
        // matched as a regular local above.
        const dupe = symbols.some(
          (s) => s.line === lineNo && s.name === name && s.scope === currentFn,
        );
        if (!dupe) {
          const col = code.indexOf(name, code.indexOf(type) + type.length) + 1;
          symbols.push({
            name,
            type,
            kind: "local",
            line: lineNo,
            column: col,
            scope: currentFn,
          });
        }
      }
    }

    // Count braces in this (comment-stripped) line. Increment depth for `{`,
    // decrement for `}` — once we leave the function body (`depth` returns to
    // 0 with `currentFn` set) clear `currentFn` so subsequent declarations
    // are global again.
    for (const ch of code) {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        if (depth > 0) depth -= 1;
        if (depth === 0) {
          if (currentFn) currentFn = null;
          if (structDepth > 0) structDepth = Math.max(0, structDepth - 1);
        }
      }
    }
  }

  return { symbols };
}

/**
 * Returns symbols visible at the given line — globals plus any symbols whose
 * `scope` matches the function containing that line. The result is ordered:
 *   1. Locals of the enclosing function (declared on or before `line`).
 *   2. Parameters of the enclosing function.
 *   3. Globals (functions, structs, uniforms, ins/outs, etc.).
 * Duplicate names (e.g. a local shadowing a global) keep only the first
 * entry — which is the in-scope one — so consumers can treat the list as
 * deduplicated by name.
 */
export function symbolsVisibleAt(
  table: SymbolTable,
  line: number,
): GlslSymbol[] {
  // Find the function whose declaration line is the latest one at or before
  // `line` AND whose body still contains `line`. We approximate "body
  // contains" by looking for the next function declaration after it: if
  // there is one whose declaration line is also <= `line`, that one takes
  // precedence. This works for sequential function definitions without
  // having to track exact body end offsets.
  const fns = table.symbols
    .filter((s) => s.kind === "function")
    .sort((a, b) => a.line - b.line);
  let enclosing: string | null = null;
  for (const fn of fns) {
    if (fn.line <= line) enclosing = fn.name;
    else break;
  }

  const locals: GlslSymbol[] = [];
  const params: GlslSymbol[] = [];
  const globals: GlslSymbol[] = [];
  for (const s of table.symbols) {
    if (s.scope === null) {
      globals.push(s);
    } else if (s.scope === enclosing) {
      if (s.kind === "parameter") params.push(s);
      else if (s.kind === "local" && s.line <= line) locals.push(s);
    }
  }

  const out: GlslSymbol[] = [];
  const seen = new Set<string>();
  for (const s of [...locals, ...params, ...globals]) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

/**
 * Resolve `name` at `line` to its declaration. Mirrors `symbolsVisibleAt`'s
 * priority: in-scope locals/parameters win over globals. Returns `null`
 * when no declaration matches.
 */
export function resolveSymbol(
  table: SymbolTable,
  name: string,
  line: number,
): GlslSymbol | null {
  for (const s of symbolsVisibleAt(table, line)) {
    if (s.name === name) return s;
  }
  return null;
}

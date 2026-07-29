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

import { maskComments } from "./stripComments";

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
 * Struct head, mirroring {@link RE_STRUCT} but matched against a whole masked
 * source with the `m` flag (`[ \t]*` rather than `\s*` so `^` really means
 * start-of-line). Drives {@link structBodyRanges}.
 */
const RE_STRUCT_HEAD = /^[ \t]*struct\s+[A-Za-z_][\w]*\s*\{/gm;

/**
 * Absolute offset ranges covering struct *bodies* — the span strictly between
 * a `struct Foo {` head's `{` and its matching `}` — in a comment-masked
 * source. Module-local: consumers want the narrower
 * {@link structMemberNameOffsets}.
 *
 * `masked` must already have comments blanked (see `stripComments.ts`) so a
 * brace inside a comment cannot move the walk.
 */
function structBodyRanges(masked: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  RE_STRUCT_HEAD.lastIndex = 0;
  let m = RE_STRUCT_HEAD.exec(masked);
  while (m !== null) {
    const open = masked.indexOf("{", m.index);
    if (open < 0) break;
    let depth = 0;
    // An unbalanced body runs to end-of-source, matching how parseSymbolTable
    // keeps `structDepth` raised until brace depth returns to zero.
    let close = masked.length;
    for (let k = open; k < masked.length; k++) {
      const ch = masked[k];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          close = k;
          break;
        }
      }
    }
    ranges.push({ from: open + 1, to: close });
    // Nested heads inside this body are already covered by the range.
    RE_STRUCT_HEAD.lastIndex = close;
    m = RE_STRUCT_HEAD.exec(masked);
  }
  return ranges;
}

/** Qualifiers that may precede a struct member's type token. */
const MEMBER_TYPE_QUALIFIERS = new Set(["highp", "mediump", "lowp", "struct"]);

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/**
 * Absolute offsets of every struct **member declarator name** in a
 * comment-masked source — the `color` in `struct Light { vec3 color; };`.
 *
 * Struct members are not indexed by this parser (see `structDepth` in
 * {@link parseSymbolTable}), so an identifier inside a struct body resolves to
 * whatever *global* happens to share its name. That is harmless for hover but
 * catastrophic for rename: renaming `uniform vec3 color` would also rewrite
 * the unrelated member declaration `vec3 color;` inside `struct Light`, while
 * every `light.color` access is skipped by the member-access guard — the
 * shader stops compiling. Reference consumers therefore drop matches that
 * start at one of these offsets.
 *
 * Only the *name* position is excluded, never the whole body. A member's type
 * token and any array-size expression are ordinary references to real globals:
 * `struct Outer { Inner i; };` genuinely uses the struct `Inner`, and
 * `float v[MAX];` genuinely uses the const `MAX`. Skipping those would recreate
 * the same broken-shader failure from the other side — the declaration renamed,
 * the use left behind.
 *
 * Known limitation: members of an *embedded* struct definition
 * (`struct Outer { struct Inner { float a; } i; };`) are not collected — only
 * the outer declarator `i` is. GLSL ES forbids embedded struct definitions, so
 * this shape cannot compile in the playground anyway.
 */
export function structMemberNameOffsets(masked: string): Set<number> {
  const out = new Set<number>();
  for (const body of structBodyRanges(masked)) {
    collectMemberNames(masked, body.from, body.to, out);
  }
  return out;
}

/**
 * Walk one struct body, recording the offset of each declarator name. State is
 * a three-way "what does the next depth-0 identifier mean" flag: the type comes
 * first, then one name per depth-0 comma-separated declarator, reset at each
 * depth-0 `;`. Identifiers nested in `[...]` / `(...)` / an embedded body are
 * never names.
 */
function collectMemberNames(
  masked: string,
  from: number,
  to: number,
  out: Set<number>,
): void {
  let depth = 0;
  let expectType = true;
  let expectName = false;
  let i = from;
  while (i < to) {
    const ch = masked[i]!;
    if (ch === "[" || ch === "(" || ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "]" || ch === ")" || ch === "}") {
      depth = Math.max(0, depth - 1);
      // Closing an embedded `struct … { … }`: the identifier that follows is
      // the member declarator for it.
      if (ch === "}" && depth === 0) {
        expectType = false;
        expectName = true;
      }
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ",") {
      expectName = true;
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ";") {
      expectType = true;
      expectName = false;
      i += 1;
      continue;
    }
    if (!isIdentStart(ch)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < to && isIdentPart(masked[j]!)) j += 1;
    if (depth === 0) {
      if (expectName) {
        out.add(i);
        expectName = false;
      } else if (
        expectType &&
        !MEMBER_TYPE_QUALIFIERS.has(masked.slice(i, j))
      ) {
        expectType = false;
        expectName = true;
      }
    }
    i = j;
  }
}

/**
 * True when the identifier starting at `index` is a member/swizzle access —
 * i.e. the nearest preceding non-blank character on the same line is `.`.
 *
 * `v.xyz`, `light.color` and `s.color.rgb` all bind to a *member*, never to
 * the global that happens to share the name, so reference/rename consumers
 * must not treat them as occurrences.
 *
 * Known limitation, deliberately left unhandled: a dot separated from its
 * member by a **line break** (`light\n  .color`) is not detected — the guard
 * only looks backwards within the current line. GLSL style in this playground
 * never wraps member access, and a cross-line walk would need the caller to
 * pass the whole document rather than one masked line.
 */
export function precededByDot(line: string, index: number): boolean {
  let k = index - 1;
  while (k >= 0) {
    const ch = line[k];
    if (ch !== " " && ch !== "\t") break;
    k -= 1;
  }
  return k >= 0 && line[k] === ".";
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

// Memoization (L25). `buildSymbolTable` is a pure function of `source`, but the
// editor calls it on every hover / autocomplete / go-to-def / semantic-token /
// reference query — frequently several times against the *same* unchanged
// source between two edits (one cursor move fires hover + autocomplete +
// reference lookups that each re-parsed the whole document). Cross-stage
// reference resolution (`findReferencesAcrossStages`) parses two distinct
// sources — vertex + fragment — within a single call, so a size-1 cache would
// thrash; we keep a small LRU keyed by the source string.
//
// Safety: the returned SymbolTable and its GlslSymbol entries are treated as
// read-only by every consumer. `symbolsVisibleAt` builds its result from a
// fresh array (and hands out a copy of the memoized one — see
// VISIBLE_AT_CACHE), `resolveSymbol` only reads, and references/semanticTokens
// reach the table exclusively through those two helpers. Sharing a cached
// instance across callers is therefore safe — no consumer mutates it.
const SYMBOL_TABLE_CACHE_MAX = 8;
const symbolTableCache = new Map<string, SymbolTable>();

/**
 * Build the per-source symbol table, memoized by source string (small LRU).
 * The parse itself lives in `parseSymbolTable`; this wrapper serves identical
 * sources from cache and returns the *same* instance for a cache hit (see the
 * read-only safety note above).
 */
export function buildSymbolTable(source: string): SymbolTable {
  const cached = symbolTableCache.get(source);
  if (cached !== undefined) {
    // Mark most-recently-used: re-insert to move to the end of Map order.
    symbolTableCache.delete(source);
    symbolTableCache.set(source, cached);
    return cached;
  }
  const table = parseSymbolTable(source);
  symbolTableCache.set(source, table);
  if (symbolTableCache.size > SYMBOL_TABLE_CACHE_MAX) {
    // Evict least-recently-used: the first key in Map insertion order.
    const oldest = symbolTableCache.keys().next().value;
    if (oldest !== undefined) symbolTableCache.delete(oldest);
  }
  return table;
}

/**
 * Parse a shader source into its symbol table (uncached).
 *
 * Algorithm sketch (line-oriented walker with brace-depth tracking):
 *   1. Mask block *and* line comments with spaces (length-preserving, see
 *      `stripComments.ts`) so column arithmetic below stays source-accurate.
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
function parseSymbolTable(source: string): SymbolTable {
  const lines = maskComments(source).split(/\r?\n/);
  const symbols: GlslSymbol[] = [];

  let depth = 0;
  let currentFn: string | null = null;
  // When > 0 inside a struct body — we don't index struct members yet but we
  // must not treat them as locals.
  let structDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    // Already comment-masked: comment runs are spaces, so every index within
    // the line is still the index it had in the original source.
    const code = lines[i]!;
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
            // Parameters belong inside the function body; they are recorded
            // on the header's line at their own column. Two anchors keep that
            // column honest (L32): a running cursor so parameter N is searched
            // after parameter N-1's name, and each parameter's own type token
            // so the search starts *after* the type. Without them a bare
            // `indexOf(name, afterParen)` matches inside an earlier token —
            // `void f(mat3 m)` would report the `m` of `mat3`, and
            // `void f(vec3 v, float f)` the `f` of `float`. Falls back to the
            // function name's column when a parameter can't be located.
            let searchFrom = code.indexOf("(") + 1;
            for (const p of params) {
              const typeIdx = code.indexOf(p.type, searchFrom);
              const anchor =
                typeIdx >= 0 ? typeIdx + p.type.length : searchFrom;
              const pCol = code.indexOf(p.name, anchor);
              if (pCol >= 0) searchFrom = pCol + p.name.length;
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

// Memoization (L21). `symbolsVisibleAt` is a pure function of (table, line)
// but sits on the hottest path in the editor: `classifySemanticTokens` calls
// `resolveSymbol` — hence this — once per *identifier*, and each uncached call
// walks the whole symbol list twice (function scan + sort, then bucket) for
// every identifier on the same line. Keyed by table **identity** (a WeakMap,
// so the entry dies with the table) and then by line; keying on the line alone
// would return one source's symbols for another's, which
// `findReferencesAcrossStages` — two tables per call — would hit immediately.
//
// The cached array is never handed out directly: `symbolsVisibleAt` returns a
// copy. `main.tsx` publishes this function on the DEV `window.__sp` bridge, so
// E2E page code could otherwise sort or splice the cache in place.
const VISIBLE_AT_CACHE = new WeakMap<SymbolTable, Map<number, GlslSymbol[]>>();

/** Memoized inner form. Callers must not mutate the returned array. */
function visibleAtCached(table: SymbolTable, line: number): GlslSymbol[] {
  let perLine = VISIBLE_AT_CACHE.get(table);
  if (perLine === undefined) {
    perLine = new Map();
    VISIBLE_AT_CACHE.set(table, perLine);
  }
  const hit = perLine.get(line);
  if (hit !== undefined) return hit;
  const computed = computeVisibleAt(table, line);
  perLine.set(line, computed);
  return computed;
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
 *
 * Memoized per (table identity, line). The returned array is a fresh copy on
 * every call, so callers may sort or splice it freely.
 */
export function symbolsVisibleAt(
  table: SymbolTable,
  line: number,
): GlslSymbol[] {
  return visibleAtCached(table, line).slice();
}

function computeVisibleAt(table: SymbolTable, line: number): GlslSymbol[] {
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
  // Reads the memoized array directly — no copy — because this loop only
  // reads. Every identifier in the document funnels through here.
  for (const s of visibleAtCached(table, line)) {
    if (s.name === name) return s;
  }
  return null;
}

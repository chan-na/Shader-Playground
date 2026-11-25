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
 * Sibling modules: `glslDecl.ts` holds the lexical/declarator helpers this
 * parser and the reference consumers share; `symbolScope.ts` answers the
 * per-line scope queries (`symbolsVisibleAt`, `resolveSymbol`) over a table
 * built here.
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

import {
  bracketDepth,
  formatParameters,
  parseFunctionParameters,
  splitTopLevelDeclarators,
} from "./glslDecl";
import { IDENT_RE } from "./ident";
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

// Leading interpolation qualifiers (`flat out int v_id;`, `centroid in vec2
// v;`) are consumed by a non-capturing group so capture-group indices — and
// the column arithmetic below that keys off `sm[2]`/`sm[3]` — stay unchanged.
// Without this, `computeVaryingContract` (varyingContract.ts) would miss a
// `flat`/`centroid`-qualified varying's declaration on one stage and report a
// false "not provided" warning even though both stages agree.
//
// Like RE_LOCAL_DECL below, the first declarator ends at the first `,` or `;`
// (capture 4) so comma multi-declarations (`out vec2 v_uv, v_st;` — legal
// GLSL) leave a `, v_st;` tail for parseSymbolTable's declarator walk to
// harvest. The previous single-declarator form (`…;` only) rejected such
// lines wholesale, dropping EVERY declared name from the table — which made
// `computeVaryingContract` emit a *confident* false "vertex가 제공하지 않음"
// warning while the real program linked fine, the exact over-reporting its
// confidence gate exists to prevent. A global initializer (`const` only)
// also stops at the first comma, so the call site's bracketDepth() guard is
// what distinguishes a real declarator comma from a comma inside a call
// initializer (`const vec3 K = mix(a, b, t);`).
//
// The array suffix accepts any bracket content, not just a decimal literal:
// `out vec2 v_uv[MAX_LIGHTS];` and `[N]` are legal GLSL (a constant
// expression is allowed), and a decimal-only suffix rejected those lines
// wholesale — the same over-reporting failure the declarator walk above was
// added to fix, since the name then vanished from one stage's table and came
// back as a confident "vertex가 제공하지 않음" warning.
const RE_STORAGE_DECL =
  /^\s*(?:(?:flat|smooth|noperspective|centroid|invariant)\s+)*(uniform|in|out|attribute|varying|const)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[[^\]\r\n]*\])?\s*(?:=\s*[^,;]+)?\s*([,;])/;
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

// Memoization. `buildSymbolTable` is a pure function of `source`, but the
// editor calls it on every hover / autocomplete / go-to-def / semantic-token /
// reference query — frequently several times against the *same* unchanged
// source between two edits (one cursor move fires hover + autocomplete +
// reference lookups that each re-parsed the whole document). Cross-stage
// reference resolution (`findReferencesAcrossStages`) parses two distinct
// sources — vertex + fragment — within a single call, so a size-1 cache would
// thrash; we keep a small LRU keyed by the source string.
//
// Safety: the returned SymbolTable and its GlslSymbol entries are treated as
// read-only by every consumer. `symbolsVisibleAt` (`symbolScope.ts`) builds
// its result from a fresh array (and hands out a copy of the memoized one —
// see `VISIBLE_AT_CACHE`), `resolveSymbol` only reads, and references/semanticTokens
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
  // When > 0 we are inside an unclosed `(` — in practice a function header
  // whose parameter list is wrapped across lines. Brace depth alone cannot
  // see this (a wrapped header has no `{` yet), so continuation lines like
  // `  in vec3 n, in vec3 l,` would otherwise reach the storage-declaration
  // branch below and be harvested as *globals*: `n` as a phantom varying and
  // — because the tail walker takes the first identifier token of the next
  // declarator — the qualifier `in` itself as a phantom symbol named "in".
  // That pollutes semantic highlighting, makes hover report a global, and
  // lets rename rewrite every `in` keyword in the file.
  let parenDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    // Already comment-masked: comment runs are spaces, so every index within
    // the line is still the index it had in the original source.
    const code = lines[i]!;
    const lineNo = i + 1;

    // Handle declarations BEFORE updating depth so a function header on this
    // line is recorded at the outer scope, and locals inside the function
    // body (which start the line AFTER `{`) land at depth >= 1.
    if (depth === 0 && structDepth === 0 && parenDepth === 0) {
      // Storage-qualifier declarations (uniform/in/out/attribute/varying/
      // const), scanned REPEATEDLY across the line rather than once. A line
      // may carry more than one `;`-terminated declaration — `out vec2 v_uv;
      // out vec3 v_n;`, or one trailing a single-line `struct L { vec3 c; };`
      // / `precision highp float;` — and stopping at the first used to drop
      // every later name from the table. `computeVaryingContract` then
      // reported the fragment's input as a *confident* "vertex가 제공하지
      // 않음" warning for a program that links fine (mirror direction: a
      // consumed varying rendered as a confident "unused" row). Restarts are
      // only attempted where the line's brackets are balanced (`lineDepth`),
      // so a member inside `struct L { … }` or a body opened on this line can
      // never be harvested as a global.
      let scanFrom = 0;
      let lineDepth = 0;
      let firstAttempt = true;
      while (scanFrom < code.length) {
        const seg = code.slice(scanFrom);
        const sm = lineDepth === 0 ? RE_STORAGE_DECL.exec(seg) : null;
        let advance: number;
        if (sm) {
          const kind = STORAGE_QUALIFIERS[sm[1]!]!;
          const type = sm[2]!;
          const name = sm[3]!;
          const col =
            scanFrom + seg.indexOf(name, seg.indexOf(type) + type.length) + 1;
          symbols.push({
            name,
            type,
            kind,
            line: lineNo,
            column: col,
            scope: null,
          });
          // Comma multi-declaration (`out vec2 v_uv, v_st;`): same walk as the
          // local-decl harvester below, including the bracketDepth guard so a
          // comma inside a `const` initializer's call arguments is not
          // harvested as a phantom global. `sm[0]` starts at offset 0 of the
          // segment (the regex is `^`-anchored), so the tail begins at its
          // length and every column is offset by `scanFrom`.
          if (sm[4] === "," && bracketDepth(sm[0]) === 0) {
            const tail = seg.slice(sm[0].length);
            let cursor = sm[0].length;
            for (const declarator of splitTopLevelDeclarators(tail)) {
              const m2 = IDENT_RE.exec(declarator);
              if (!m2) continue;
              const idx = seg.indexOf(m2[0], cursor);
              if (idx < 0) continue;
              symbols.push({
                name: m2[0],
                type,
                kind,
                line: lineNo,
                column: scanFrom + idx + 1,
                scope: null,
              });
              cursor = idx + m2[0].length;
            }
          }
          if (sm[4] === ";") {
            advance = sm[0].length;
          } else {
            // A `,` terminator means the declarator list (or a call
            // initializer) runs on; resume after the declaration's `;`.
            const semi = seg.indexOf(";", sm[0].length);
            advance = semi < 0 ? seg.length : semi + 1;
          }
          // fall through — counting braces below is still cheap and harmless.
        } else {
          if (firstAttempt) {
            // Struct / function heads are only recognised at the start of a
            // line, exactly as before — `firstAttempt` is true only while
            // `scanFrom` is 0.
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
                  code.indexOf(
                    name,
                    code.indexOf(returnType) + returnType.length,
                  ) + 1;
                symbols.push({
                  name,
                  type: returnType,
                  kind: "function",
                  line: lineNo,
                  column: col,
                  scope: null,
                  parameters: formatParameters(params),
                });
                // Parameters belong inside the function body; they are
                // recorded on the header's line at their own column. Two
                // anchors keep that column honest (L32): a running cursor so
                // parameter N is searched after parameter N-1's name, and each
                // parameter's own type token so the search starts *after* the
                // type. Without them a bare `indexOf(name, afterParen)`
                // matches inside an earlier token — `void f(mat3 m)` would
                // report the `m` of `mat3`, and `void f(vec3 v, float f)` the
                // `f` of `float`. Falls back to the function name's column
                // when a parameter can't be located.
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
                // Enter the function body. Braces on this line are counted
                // below.
                currentFn = name;
              }
            }
          }
          const semi = seg.indexOf(";");
          if (semi < 0) break;
          advance = semi + 1;
        }
        firstAttempt = false;
        lineDepth += bracketDepth(seg.slice(0, advance));
        scanFrom += advance;
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
              const m2 = IDENT_RE.exec(declarator);
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
    // are global again. Parens are tracked alongside so a parameter list
    // wrapped across lines suppresses the global-declaration branch above
    // until it closes.
    for (const ch of code) {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        if (depth > 0) depth -= 1;
        if (depth === 0) {
          if (currentFn) currentFn = null;
          if (structDepth > 0) structDepth = Math.max(0, structDepth - 1);
        }
      } else if (ch === "(") {
        parenDepth += 1;
      } else if (ch === ")") {
        if (parenDepth > 0) parenDepth -= 1;
      }
    }
  }

  return { symbols };
}

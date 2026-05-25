/**
 * Semantic token classifier for GLSL editors (Phase 26).
 *
 * Reads a shader source string and returns identifier-position tokens tagged
 * with the kind of declaration they reference — `uniform`, `system-uniform`,
 * `in`/`out`/`varying`/`attribute`, `const`, `parameter`, `struct-type`,
 * user-defined function, or builtin function. Local variable usages are
 * intentionally NOT classified (they keep the editor's default identifier
 * color so the more-meaningful tokens stand out).
 *
 * This module is pure TS — no CodeMirror dependency. It pairs with
 * `ui/CodeEditor/semanticHighlight.ts`, which converts the token stream into
 * `Decoration.mark` ranges scoped to the visible viewport.
 *
 * Resolution priority for each identifier:
 *   1. Scope-aware document symbols (`resolveSymbol` from symbolTable.ts) —
 *      mirrors hover/autocomplete behaviour so locals shadow globals etc.
 *   2. `BUILTIN_FUNCTIONS` catalogue → `function-builtin`.
 *   3. `SYSTEM_UNIFORMS` set → `system-uniform` (catches names that are
 *      consumed by the runtime even when the user hasn't declared them; the
 *      authoritative compile path auto-binds these).
 *   4. Anything else (keywords, types, locals, unknown identifiers) → no
 *      token; the editor's base highlighting handles them.
 */

// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + regex matches with documented length guards

import { SYSTEM_UNIFORMS } from "../graph/uniformParser";
import { BUILTIN_FUNCTIONS } from "./builtins";
import {
  buildSymbolTable,
  resolveSymbol,
  type SymbolTable,
} from "./symbolTable";

/**
 * Closed enumeration of token kinds the highlighter emits. The CodeMirror
 * decoration layer maps each value to a `cm-glsl-token-<kind>` CSS class, so
 * adding a new kind requires both an entry here and the corresponding theme
 * rule in `glslSetup.ts`.
 */
export type SemanticTokenKind =
  | "uniform"
  | "system-uniform"
  | "in"
  | "out"
  | "attribute"
  | "varying"
  | "const"
  | "parameter"
  | "struct-type"
  | "function-user"
  | "function-builtin";

export interface SemanticToken {
  /** Absolute document offset (inclusive). */
  from: number;
  /** Absolute document offset (exclusive). */
  to: number;
  kind: SemanticTokenKind;
}

/**
 * Identifier scanner. Matches GLSL identifier shapes — we run this against
 * already-stripped lines (no block/line comments), so it can't accidentally
 * tag a word inside a comment.
 */
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * Strip block comments (`/* ... *​/`) preserving newlines so line numbers and
 * column offsets stay aligned with the original source. Mirrors the helper
 * in `symbolTable.ts`; kept local to avoid widening that module's API.
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Strip a `//` line comment by replacing the comment portion with spaces, so
 * column indices in the returned line still map 1:1 onto the source line.
 * Returning the modified line (rather than a slice) lets the identifier
 * scanner skip the comment naturally.
 */
function maskLineComment(line: string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return line;
  return line.slice(0, idx) + " ".repeat(line.length - idx);
}

/** Map a symbol-table entry's `kind` to the highlighter token kind. */
function tokenKindForSymbol(
  symbolKind: string,
  name: string,
): SemanticTokenKind | null {
  switch (symbolKind) {
    case "uniform":
      return SYSTEM_UNIFORMS.has(name) ? "system-uniform" : "uniform";
    case "in":
      return "in";
    case "out":
      return "out";
    case "attribute":
      return "attribute";
    case "varying":
      return "varying";
    case "const":
      return "const";
    case "parameter":
      return "parameter";
    case "struct":
      return "struct-type";
    case "function":
      return "function-user";
    // "local" — deliberately unclassified.
    default:
      return null;
  }
}

/**
 * Classify one identifier occurrence. Pure helper — visible for testing the
 * resolution priority in isolation. `table` is built once per scan and reused
 * across all identifiers on a line.
 */
export function classifyIdentifier(
  table: SymbolTable,
  name: string,
  line: number,
): SemanticTokenKind | null {
  // 1. In-scope symbol-table lookup (covers user uniforms, params, functions,
  //    structs, etc.). Locals deliberately resolve to `null` below.
  const sym = resolveSymbol(table, name, line);
  if (sym) {
    const k = tokenKindForSymbol(sym.kind, sym.name);
    if (k) return k;
    // sym.kind === "local" — fall through so we don't shadow a builtin name
    // a user happened to reuse as a local (rare, but cheap to handle).
  }
  // 2. Builtin function (sin, mix, texture, ...).
  if (BUILTIN_FUNCTIONS[name]) return "function-builtin";
  // 3. System uniform used without explicit redeclaration in this stage —
  //    the runtime auto-binds these so they're worth highlighting.
  if (SYSTEM_UNIFORMS.has(name)) return "system-uniform";
  return null;
}

/**
 * Scan `source` for identifier occurrences and return the classified token
 * stream in document order. Each declaration site (e.g. the `u_time` in
 * `uniform float u_time;`) is included alongside use sites — both share the
 * same kind, which is the behaviour the highlighter wants.
 *
 * Performance: one symbol-table build + one regex pass per source. The token
 * array is allocated once and returned; the CM ViewPlugin further filters by
 * visible ranges when constructing the `DecorationSet`.
 */
export function classifySemanticTokens(source: string): SemanticToken[] {
  const table = buildSymbolTable(source);
  const noBlock = stripBlockComments(source);
  const lines = noBlock.split(/\r?\n/);

  const tokens: SemanticToken[] = [];
  // Running absolute offset to the start of the current line. Mirrors CM's
  // doc.lineAt(...).from semantics — we advance by `line.length + 1` to
  // account for the stripped `\n`, which matches the original source layout
  // because stripBlockComments preserves newlines.
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const masked = maskLineComment(raw);
    const lineNo = i + 1;

    IDENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
    while ((m = IDENT_RE.exec(masked)) !== null) {
      const name = m[0];
      const kind = classifyIdentifier(table, name, lineNo);
      if (kind === null) continue;
      tokens.push({
        from: lineStart + m.index,
        to: lineStart + m.index + name.length,
        kind,
      });
    }

    // +1 for the newline separator that `split(/\r?\n/)` consumed. The last
    // line has no trailing newline but we won't iterate again, so harmless.
    lineStart += raw.length + 1;
  }

  return tokens;
}

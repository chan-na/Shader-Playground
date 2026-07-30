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
import { maskComments } from "./stripComments";
import {
  buildSymbolTable,
  precededByDot,
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
  // Split on "\n" alone so a CRLF line keeps its trailing `\r` — see the same
  // split in `references.ts` for the full rationale. In short: the `lineStart`
  // walk below only accounts for the `\n`, so stripping the `\r` here would
  // under-advance by one character per preceding line. The only production
  // caller is `semanticHighlight.ts`, which feeds `view.state.doc.toString()`
  // and CodeMirror normalises CRLF to LF on doc construction — so this walk is
  // not reachable with `\r` today. It is kept exact anyway: the defect is the
  // same one that corrupted CRLF renames, and `main.tsx` exposes `classify`
  // as a dev hook that takes an arbitrary string.
  const lines = maskComments(source).split("\n");

  const tokens: SemanticToken[] = [];
  // Running absolute offset to the start of the current line. Mirrors CM's
  // doc.lineAt(...).from semantics — every offset stays 1:1 with the original
  // source because `maskComments` preserves length and line terminators.
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    IDENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
    while ((m = IDENT_RE.exec(line)) !== null) {
      // `v.xyz` / `light.color` name a member, not the same-named global —
      // painting them with the global's colour is a lie (L5).
      if (precededByDot(line, m.index)) continue;
      const name = m[0];
      const kind = classifyIdentifier(table, name, lineNo);
      if (kind === null) continue;
      tokens.push({
        from: lineStart + m.index,
        to: lineStart + m.index + name.length,
        kind,
      });
    }

    // +1 for the `\n` that `split("\n")` consumed. A CRLF line's `\r` is still
    // part of `line`, so this stays exact for both line-ending styles. The last
    // line has no trailing newline but we won't iterate again, so harmless.
    lineStart += line.length + 1;
  }

  return tokens;
}

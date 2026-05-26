/**
 * Reference finder for GLSL editor refactoring (Phase 27).
 *
 * Given a source string and an identifier position (name + line), returns
 * every occurrence in the document that binds to the same declaration. The
 * scope rules mirror {@link resolveSymbol} so a global `foo` is *not*
 * reported inside a function that declares a local `foo` — that occurrence
 * resolves to the local, not the global.
 *
 * Used by:
 *   - `ui/CodeEditor/referenceHighlight.ts` — paint occurrences when the
 *     cursor sits on an identifier.
 *   - `ui/CodeEditor/rename.ts` — drive a single-transaction rename refactor.
 *
 * Not goals: cross-file references (GLSL has no imports), preprocessor
 * expansion, or overload resolution. Two functions with the same name are
 * collapsed by `resolveSymbol`'s "first match wins" rule — only the first
 * declaration's references are returned.
 */

// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + length-guarded regex captures

import {
  buildSymbolTable,
  type GlslSymbol,
  resolveSymbol,
  type SymbolTable,
} from "./symbolTable";

export interface ReferenceSite {
  /** Absolute document offset (inclusive). */
  from: number;
  /** Absolute document offset (exclusive). */
  to: number;
  /** 1-based line number where the reference appears. */
  line: number;
  /** 1-based column (start of identifier). */
  column: number;
  /** True when this site is the declaration of the target symbol. */
  isDefinition: boolean;
}

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function maskLineComment(line: string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return line;
  return line.slice(0, idx) + " ".repeat(line.length - idx);
}

/**
 * Find references to the declaration that binds `name` at `atLine`. Returns
 * an empty array when no declaration is in scope (the cursor is on a builtin,
 * a keyword, an unknown identifier, or a name that is shadowed away).
 */
export function findReferences(
  source: string,
  name: string,
  atLine: number,
): ReferenceSite[] {
  const table = buildSymbolTable(source);
  const target = resolveSymbol(table, name, atLine);
  if (!target) return [];
  return findReferencesOf(source, table, target);
}

/**
 * Variant that skips the resolution step when the caller already has both
 * the table and the target symbol in hand. Exported for tests and for callers
 * that compute the target once and look up its references many times.
 */
export function findReferencesOf(
  source: string,
  table: SymbolTable,
  target: GlslSymbol,
): ReferenceSite[] {
  const noBlock = stripBlockComments(source);
  const lines = noBlock.split(/\r?\n/);
  const sites: ReferenceSite[] = [];

  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const masked = maskLineComment(raw);
    const lineNo = i + 1;

    IDENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
    while ((m = IDENT_RE.exec(masked)) !== null) {
      if (m[0] !== target.name) continue;
      // Ask the symbol table what binding is in scope at this occurrence.
      // If it isn't the target, we hit a shadowed name (e.g. a global `foo`
      // shadowed by a local `foo` inside a function body). Skip it.
      const sym = resolveSymbol(table, target.name, lineNo);
      if (!sym) continue;
      if (sym.line !== target.line || sym.column !== target.column) continue;
      const col = m.index + 1;
      const isDef = lineNo === target.line && col === target.column;
      sites.push({
        from: lineStart + m.index,
        to: lineStart + m.index + target.name.length,
        line: lineNo,
        column: col,
        isDefinition: isDef,
      });
    }

    lineStart += raw.length + 1;
  }

  return sites;
}

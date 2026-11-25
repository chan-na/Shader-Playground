/**
 * Scope queries over a parsed {@link SymbolTable}: which declarations are
 * visible at a given line, and which one a name resolves to there. Split
 * from `symbolTable.ts`, which owns parsing and the per-source table cache.
 */

import type { GlslSymbol, SymbolTable } from "./symbolTable";

// Memoization. `symbolsVisibleAt` is a pure function of (table, line)
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

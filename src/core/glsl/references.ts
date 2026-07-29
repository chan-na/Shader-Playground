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
 * Two occurrence classes are excluded even when the spelling matches (L5),
 * because neither binds to the global:
 *   - **Member / swizzle access** — the `color` in `light.color`, the `xyz` in
 *     `v.xyz`. See `precededByDot`, including its documented line-break
 *     limitation.
 *   - **Struct member declarator names** — the `color` in `struct Light { vec3
 *     color; }`. See `structMemberNameOffsets`. Excluding only the first class
 *     would make rename *break* shaders: the member declaration would be
 *     rewritten while every access to it was left alone. Only the name
 *     position is excluded — a member's type token and array-size expression
 *     still reference real globals and must stay renameable.
 *
 * Not goals: cross-file references (GLSL has no imports), preprocessor
 * expansion, or overload resolution. Two functions with the same name are
 * collapsed by `resolveSymbol`'s "first match wins" rule — only the first
 * declaration's references are returned.
 */

// biome-ignore-all lint/style/noNonNullAssertion: noUncheckedIndexedAccess + length-guarded regex captures

import { maskComments } from "./stripComments";
import {
  buildSymbolTable,
  type GlslSymbol,
  precededByDot,
  resolveSymbol,
  type SymbolTable,
  structMemberNameOffsets,
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

/** Which shader stage a {@link CrossStageReferenceSite} belongs to. */
export type ShaderStage = "vertex" | "fragment";

/** A reference site tagged with its owning shader stage. */
export interface CrossStageReferenceSite extends ReferenceSite {
  stage: ShaderStage;
}

export interface CrossStageSources {
  vertex: string;
  fragment: string;
}

// Globals whose name semantically belongs to the *program* (not to a single
// stage's local scope) and are therefore candidates for cross-stage rename.
// Specifically:
//   - uniforms — linked program-wide; both stages must use the same name.
//   - varyings — a vertex `out` and a fragment `in` with the same name form
//     one logical link, so renaming one without the other breaks it.
//   - in / out / varying / attribute storage qualifiers.
//   - functions and structs — independently per-stage in the language but the
//     overwhelming user intent on a shared name is "rename both at once".
//   - top-level consts — same reasoning as functions.
const CROSS_STAGE_KINDS = new Set([
  "uniform",
  "in",
  "out",
  "attribute",
  "varying",
  "const",
  "function",
  "struct",
]);

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

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
  const masked = maskComments(source);
  const lines = masked.split(/\r?\n/);
  // Struct member *names* share the global namespace's spelling but not its
  // binding (L5) — see `structMemberNameOffsets`. Member types and array sizes
  // are deliberately NOT excluded: they are real uses of real globals.
  const memberNameOffsets = structMemberNameOffsets(masked);
  const sites: ReferenceSite[] = [];

  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    IDENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
    while ((m = IDENT_RE.exec(line)) !== null) {
      if (m[0] !== target.name) continue;
      // `v.color` / `s.xyz` bind to a member, never to the same-named global.
      if (precededByDot(line, m.index)) continue;
      const from = lineStart + m.index;
      if (memberNameOffsets.has(from)) continue;
      // Ask the symbol table what binding is in scope at this occurrence.
      // If it isn't the target, we hit a shadowed name (e.g. a global `foo`
      // shadowed by a local `foo` inside a function body). Skip it.
      const sym = resolveSymbol(table, target.name, lineNo);
      if (!sym) continue;
      if (sym.line !== target.line || sym.column !== target.column) continue;
      const col = m.index + 1;
      const isDef = lineNo === target.line && col === target.column;
      sites.push({
        from,
        to: from + target.name.length,
        line: lineNo,
        column: col,
        isDefinition: isDef,
      });
    }

    lineStart += line.length + 1;
  }

  return sites;
}

/**
 * Cross-stage reference finder for ShaderNode rename (Phase 28).
 *
 * Given both stage sources, an identifier name, the stage where the cursor
 * landed (`originStage`) and the 1-based line at the cursor, returns every
 * occurrence that should be renamed *together* with the origin binding. The
 * rule is:
 *
 *   - The origin stage always uses the same logic as {@link findReferences}.
 *     If the cursor is on a local, parameter, or any binding the symbol table
 *     can resolve, the matched sites go into the result.
 *
 *   - The other stage is searched only when the origin binding is a top-level
 *     (`scope === null`) symbol of a kind in {@link CROSS_STAGE_KINDS}. In
 *     that stage we collect identifier occurrences whose own resolver lands
 *     on a top-level symbol with the same name and a cross-stage-eligible
 *     kind. If no such global exists in the other stage, the result is the
 *     origin-stage sites alone — a clean partial rename.
 *
 * Locals and parameters never cross stages — `float k` inside vertex `main`
 * is unrelated to a `float k` inside fragment `main` even though both are
 * named identically. This matches the GLSL linker model.
 *
 * Stage A always appears before Stage B in the result for a given stage; the
 * vertex stage is emitted before fragment when both contribute sites.
 */
export function findReferencesAcrossStages(
  sources: CrossStageSources,
  name: string,
  originStage: ShaderStage,
  atLine: number,
): CrossStageReferenceSite[] {
  const originSource =
    originStage === "vertex" ? sources.vertex : sources.fragment;
  const originTable = buildSymbolTable(originSource);
  const target = resolveSymbol(originTable, name, atLine);
  if (!target) return [];

  const originSites = findReferencesOf(originSource, originTable, target).map(
    (s): CrossStageReferenceSite => ({ ...s, stage: originStage }),
  );

  // Locals / parameters never share names across stages — bail with the
  // origin-only sites. Same for any unknown kind we haven't whitelisted.
  if (target.scope !== null || !CROSS_STAGE_KINDS.has(target.kind)) {
    return sortByStageAndOffset(originSites);
  }

  const otherStage: ShaderStage =
    originStage === "vertex" ? "fragment" : "vertex";
  const otherSource =
    otherStage === "vertex" ? sources.vertex : sources.fragment;
  const otherTable = buildSymbolTable(otherSource);

  // Find a matching cross-stage-eligible global in the other stage. We look
  // it up via resolveSymbol at line 1 so only globals (scope === null) come
  // back — function bodies start later.
  const otherTarget = resolveSymbol(otherTable, target.name, 1);
  if (
    !otherTarget ||
    otherTarget.scope !== null ||
    !CROSS_STAGE_KINDS.has(otherTarget.kind)
  ) {
    return sortByStageAndOffset(originSites);
  }

  const otherSites = findReferencesOf(otherSource, otherTable, otherTarget).map(
    (s): CrossStageReferenceSite => ({ ...s, stage: otherStage }),
  );

  return sortByStageAndOffset([...originSites, ...otherSites]);
}

function sortByStageAndOffset(
  sites: CrossStageReferenceSite[],
): CrossStageReferenceSite[] {
  return [...sites].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage === "vertex" ? -1 : 1;
    return a.from - b.from;
  });
}

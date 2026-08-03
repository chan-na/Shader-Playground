/**
 * Vertex↔fragment varying contract (A-2, `docs/learnability-plan-2026-08.md`
 * T4). GLSL links a vertex `out` to a fragment `in` of the same name
 * *implicitly* — there is no port/edge for it anywhere in this app's graph —
 * so a mismatch between the two stages only ever surfaces as a WebGL link
 * error (or, worse, a silently-undefined value) with no indication of which
 * varying was at fault. This module makes that implicit contract explicit by
 * diffing the two stages' declared varyings.
 *
 * Deliberately reuses {@link buildSymbolTable} and {@link maskComments}
 * rather than writing a second GLSL scanner: the symbol table already parses
 * every storage-qualified declaration (including the interpolation-qualifier
 * extension added alongside this module — see `symbolTable.ts`'s
 * `RE_STORAGE_DECL`), so this module is pure post-processing over its output.
 */

import { maskComments } from "./stripComments";
import {
  buildSymbolTable,
  type GlslSymbol,
  type SymbolTable,
} from "./symbolTable";

export type VaryingStatus =
  | "linked"
  | "unused"
  | "missing-out"
  | "type-mismatch";

export interface VaryingRow {
  name: string;
  /** Declared type on the vertex side, or `null` if vertex doesn't declare it. */
  vertexType: string | null;
  /** Declared type on the fragment side, or `null` if fragment doesn't declare it. */
  fragmentType: string | null;
  /**
   * Approximation of the GLSL ES 3.0 link-error condition "fragment input is
   * statically used" — see the module-level note on {@link isStaticallyUsed}
   * for exactly what counts.
   */
  fragmentUsed: boolean;
  /** 1-based line of the fragment `in`/`varying` declaration, for ProblemsPanel jump. */
  fragmentLine?: number;
  status: VaryingStatus;
}

export interface VaryingContract {
  rows: VaryingRow[];
  /**
   * False when either stage contains a shape this module cannot see through
   * (preprocessor branch, interface block, line-wrapped storage declaration —
   * see {@link hasConfidenceHazard}). A verdict hold in *both* directions:
   * `confidentVaryingWarnings` refuses to surface *any* warning when this is
   * false, because the declaration set the diff was computed from may not be
   * the one that actually compiles — and `VaryingBridgeSection` equally
   * withholds the positive "linked" ✓, because a green check derived from
   * that same unreliable set is fabricated reassurance in the opposite
   * direction (a vertex `out` inside a dead `#ifdef` branch still lands in
   * the symbol table, so a row can read "linked" while the real program
   * fails to link).
   */
  confident: boolean;
}

// Vertex-side candidates: `out`/`varying` (ES1 `varying` is legal on both
// stages with no `in`/`out` split). Vertex `in` is an attribute and fragment
// `out` is a color target — neither is a varying, so the stage-specific kind
// filters below exclude them automatically without any extra bookkeeping.
const VERTEX_VARYING_KINDS = new Set(["out", "varying"]);
const FRAGMENT_VARYING_KINDS = new Set(["in", "varying"]);

/**
 * A preprocessor conditional (`#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`)
 * anywhere in a stage means that stage's declaration set is branch-dependent
 * — the symbol table parses every branch unconditionally (it doesn't
 * evaluate the preprocessor), so what it reports may not match what actually
 * compiles for a given `#define` configuration. Matched against the
 * *comment-masked* source so a directive mentioned only in a comment doesn't
 * trip it.
 */
const RE_PREPROCESSOR_BRANCH = /^[ \t]*#[ \t]*(?:if|ifdef|ifndef|elif|else)\b/m;

/**
 * A GLSL interface block (`out VS { vec3 v; } vs;`) declares its members
 * *inside* the braces — `symbolTable.ts` does not parse block members (see
 * its struct-body handling, which interface blocks share the shape of), so a
 * varying declared this way is invisible to `buildSymbolTable` on whichever
 * stage uses it. Reporting "missing" for something we simply didn't parse
 * would be a false positive, so confidence is withdrawn instead.
 */
const RE_INTERFACE_BLOCK = /\b(?:in|out|varying)\s+[A-Za-z_]\w*\s*\{/;

/**
 * A varying-capable storage declaration whose declarator list does not end
 * on its own line (`out vec2 v_uv,` continued on the next line, or `out
 * vec2` with the name wrapped). `symbolTable.ts` is line-oriented —
 * `RE_STORAGE_DECL` only matches declarations completed on one line (comma
 * multi-declarations included, via its declarator walk) — so whatever the
 * wrap carries onto the next line is invisible to the diff, and reporting
 * "missing" for a declaration that was merely line-wrapped would be a
 * confident false alarm. Matched per line (`m` flag, `[^;{}\r\n]*$` = "the
 * rest of this line contains no `;`"), against the comment-masked source;
 * refusing `{` keeps an interface-block head from double-tripping. A
 * multi-line function header with `in`/`out` parameter qualifiers at a line
 * start trips this too — accepted: that only withdraws confidence
 * (silence), never fabricates a warning.
 */
const RE_WRAPPED_STORAGE_DECL =
  /^[ \t]*(?:(?:flat|smooth|noperspective|centroid|invariant)[ \t]+)*(?:in|out|varying)[ \t]+[^;{}\r\n]*$/m;

/**
 * Intentional non-detection, on purpose (silence, not a false "OK"):
 *  - Array-size mismatches (`out vec3 v[2];` vs `in vec3 v[3];`) — this
 *    module only compares the type token, not any trailing `[N]`.
 *  - Interpolation-qualifier mismatches (`flat out int v;` vs
 *    `smooth in int v;`, which GLSL ES *does* reject at link time) — the
 *    qualifier is consumed and discarded by `RE_STORAGE_DECL`, so it never
 *    reaches this module.
 * Both are rare in hand-written playground shaders, and under-reporting a
 * real problem is the safe direction for a "confident" contract: silence
 * here does not fabricate false reassurance the way a wrong "linked" verdict
 * would, and `confident` already covers the higher-likelihood hazards above.
 *
 * Admission criterion for this list: a shape may stay non-detected ONLY if
 * its failure mode is silence — a real mismatch we fail to flag. A *legal*
 * shape the parser fails to even see pushes the other way: its declarations
 * vanish from one stage's table and resurface as confident "missing-out"
 * warnings (or an unearned "linked" ✓) — over-reporting, which this round's
 * principle ranks strictly worse than silence. Such a shape must either be
 * parsed correctly (comma multi-declarations, `out vec2 v_uv, v_st;`, are
 * harvested by `RE_STORAGE_DECL`'s declarator walk in `symbolTable.ts`) or
 * withdraw confidence here ({@link RE_WRAPPED_STORAGE_DECL}).
 */
function hasConfidenceHazard(maskedSource: string): boolean {
  return (
    RE_PREPROCESSOR_BRANCH.test(maskedSource) ||
    RE_INTERFACE_BLOCK.test(maskedSource) ||
    RE_WRAPPED_STORAGE_DECL.test(maskedSource)
  );
}

/** Escape a GLSL identifier for use inside a `RegExp` literal. */
function escapeRegExp(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Approximates GLSL ES 3.0's link-time "statically used" condition for a
 * fragment input: counts whole-word occurrences of `name` in the
 * comment-masked fragment source and requires at least 2 — the declaration
 * itself is always one occurrence, so a second is required to prove the
 * shader body actually reads it. A varying that's declared but never
 * referenced again does not trigger a link error, so it must not trigger a
 * warning here either (that's exactly the "statically-unused" case the
 * confidence gate below exists to suppress).
 *
 * Known limitation, deliberately unaddressed: a *local variable* that
 * shadows the varying's name (`vec2 v_uv = ...;` inside a function, where
 * `v_uv` is also the fragment input's name) counts as a "use" here even
 * though the varying itself is never read. This is rare in hand-written
 * shaders and only pushes in the direction of one extra warning being shown
 * (never a missed one), which is the safe side to err on.
 */
function isStaticallyUsed(name: string, maskedSource: string): boolean {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  const matches = maskedSource.match(re);
  return (matches?.length ?? 0) >= 2;
}

/**
 * Global (`scope === null`) declarations of the given kinds, in source
 * order, deduplicated by name (first declaration wins — a duplicate
 * redeclaration is invalid GLSL and not this module's concern).
 */
function collectVaryingCandidates(
  table: SymbolTable,
  kinds: ReadonlySet<string>,
): GlslSymbol[] {
  const seen = new Set<string>();
  const out: GlslSymbol[] = [];
  for (const s of table.symbols) {
    if (s.scope !== null) continue;
    if (!kinds.has(s.kind)) continue;
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

function computeStatus(
  vertexType: string | null,
  fragmentType: string | null,
): VaryingStatus {
  if (vertexType !== null && fragmentType !== null) {
    return vertexType === fragmentType ? "linked" : "type-mismatch";
  }
  return vertexType !== null ? "unused" : "missing-out";
}

function buildRow(
  name: string,
  vertexType: string | null,
  fragment: GlslSymbol | undefined,
  maskedFragmentSource: string,
): VaryingRow {
  const fragmentType = fragment ? fragment.type : null;
  return {
    name,
    vertexType,
    fragmentType,
    fragmentUsed: isStaticallyUsed(name, maskedFragmentSource),
    ...(fragment ? { fragmentLine: fragment.line } : {}),
    status: computeStatus(vertexType, fragmentType),
  };
}

/**
 * Diffs a vertex and fragment shader's declared varyings. Rows are ordered
 * vertex-declaration-first (covering `linked`/`unused`/`type-mismatch`),
 * followed by fragment-only declarations (`missing-out`) in fragment
 * declaration order.
 */
export function computeVaryingContract(
  vertexSource: string,
  fragmentSource: string,
): VaryingContract {
  const vertexTable = buildSymbolTable(vertexSource);
  const fragmentTable = buildSymbolTable(fragmentSource);

  const vertexCandidates = collectVaryingCandidates(
    vertexTable,
    VERTEX_VARYING_KINDS,
  );
  const fragmentCandidates = collectVaryingCandidates(
    fragmentTable,
    FRAGMENT_VARYING_KINDS,
  );
  const fragmentByName = new Map(fragmentCandidates.map((s) => [s.name, s]));
  const vertexNames = new Set(vertexCandidates.map((s) => s.name));

  const maskedFragmentSource = maskComments(fragmentSource);

  const rows: VaryingRow[] = [];
  for (const v of vertexCandidates) {
    rows.push(
      buildRow(
        v.name,
        v.type,
        fragmentByName.get(v.name),
        maskedFragmentSource,
      ),
    );
  }
  for (const f of fragmentCandidates) {
    if (vertexNames.has(f.name)) continue;
    rows.push(buildRow(f.name, null, f, maskedFragmentSource));
  }

  const confident =
    !hasConfidenceHazard(maskComments(vertexSource)) &&
    !hasConfidenceHazard(maskedFragmentSource);

  return { rows, confident };
}

/**
 * Rows worth surfacing as warnings: a fragment input that's statically used
 * but the vertex stage doesn't provide it (or provides it with a mismatched
 * type). Returns `[]` whenever `confident` is false — see
 * {@link VaryingContract.confident} — so a shape this module can't fully
 * see through never produces a false alarm.
 *
 * Takes a structural (`ReadonlyArray`-based) parameter rather than
 * `VaryingContract` itself so a leaf store holding an inline-mirrored copy of
 * these fields (no import of this module, per the store-leaf discipline) can
 * pass its snapshot straight through without a cast.
 */
export function confidentVaryingWarnings(c: {
  rows: ReadonlyArray<VaryingRow>;
  confident: boolean;
}): VaryingRow[] {
  if (!c.confident) return [];
  return c.rows.filter(
    (r) =>
      (r.status === "missing-out" || r.status === "type-mismatch") &&
      r.fragmentUsed,
  );
}

/** Human-readable message for a single warning, for ProblemsPanel rows. */
export function varyingWarningMessage(row: VaryingRow): string {
  if (row.status === "missing-out") {
    return `${row.name}: fragment가 in ${row.fragmentType}으로 받지만 vertex가 out으로 제공하지 않습니다 — 링크 단계에서 에러가 되거나 값이 정의되지 않을 수 있습니다.`;
  }
  return `${row.name}: vertex는 ${row.vertexType}, fragment는 ${row.fragmentType}으로 타입이 달라 링크 단계에서 에러가 될 수 있습니다.`;
}

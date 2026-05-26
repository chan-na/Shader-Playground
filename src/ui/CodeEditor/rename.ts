/**
 * Rename refactor for GLSL editors (Phase 27 + Phase 28 cross-stage).
 *
 * F2 on an identifier prompts for a new name, then dispatches every reference
 * site as a single transaction so the whole rename is one undo step.
 *
 * Two scopes are supported:
 *   - **Single-document** (Phase 27) — the editor view's doc is the only place
 *     references can live. Used for ComputeNode (vertex-only) and anywhere the
 *     keymap fires without a ShaderNode context.
 *   - **Cross-stage** (Phase 28) — a ShaderNode pairs a vertex and a fragment
 *     source under one logical program. When the cursor is on a top-level
 *     symbol whose kind is share-able across stages (uniform, varying, in/out,
 *     function, struct, top-level const), the rename rewrites occurrences in
 *     the OTHER stage too. The current-stage edit is dispatched into the
 *     CodeMirror view (single CM undo step) and the other-stage source is
 *     committed through `applyOtherStage` (typically
 *     `graphStore.updateShaderSource` with a patch carrying BOTH stages so
 *     graph history records a single entry). Locals and parameters never
 *     cross stages — that matches the GLSL linker model.
 *
 * The prompt UX uses the browser's `window.prompt` for the lowest-friction
 * path. Tests inject a custom `promptFn` to avoid the modal.
 */

import { type EditorView, keymap } from "@codemirror/view";
import {
  type CrossStageReferenceSite,
  findReferences,
  findReferencesAcrossStages,
  type ShaderStage,
} from "../../core/glsl/references";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { GLSL_KEYWORDS, GLSL_TYPES } from "./autocomplete";
import { identifierAt } from "./hover";

const IDENT_VALID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// GLSL ES has more reserved words than what we ship in the autocomplete
// catalogue (e.g. unused future-reserved words), but `keywords ∪ types`
// catches every collision a user can run into via the playground UI.
const RESERVED = new Set<string>([...GLSL_KEYWORDS, ...GLSL_TYPES]);

export interface RenameValidation {
  ok: boolean;
  /** Human-readable error message when `ok` is false. */
  error?: string;
}

export function validateRenameName(newName: string): RenameValidation {
  if (!newName) return { ok: false, error: "Name cannot be empty" };
  if (!IDENT_VALID_RE.test(newName)) {
    return { ok: false, error: "Invalid GLSL identifier" };
  }
  if (RESERVED.has(newName)) {
    return { ok: false, error: `'${newName}' is a reserved word` };
  }
  return { ok: true };
}

/**
 * Context that promotes runRename to a cross-stage rewrite. The caller (the
 * F2 keymap) builds this from the live selection / editor / graph stores
 * when the active node is a ShaderNode; tests can hand-craft it.
 */
export interface CrossStageRenameContext {
  /** Stage the editor view's current doc belongs to. */
  originStage: ShaderStage;
  /** Full source of the OTHER stage at the moment rename fires. */
  otherStageSource: string;
  /**
   * Commit BOTH stages' rewritten sources at once. The single-undo guarantee
   * lives here — typically one {@link graphStore.updateShaderSource} patch
   * carrying both stages so graph history records one entry.
   */
  applyBothStages(newOriginSource: string, newOtherSource: string): void;
}

/**
 * Outcome of {@link runRename}. The result is purely informational — the
 * editor has already been mutated when `applied` is true.
 */
export type RenameResult =
  | {
      applied: true;
      /** Total sites rewritten (current stage + other stage when applicable). */
      sites: number;
      /** Sites in the OTHER stage. Zero for single-document renames. */
      otherStageSites: number;
      newName: string;
    }
  | {
      applied: false;
      reason:
        | "not-on-identifier"
        | "no-binding"
        | "prompt-cancelled"
        | "unchanged"
        | "invalid-name";
    };

/**
 * Prompt the user for a new name and apply the rename. Returns a result tag
 * the caller can use for telemetry; the editor mutation, if any, has already
 * been dispatched as one transaction (single undo step on the current stage,
 * plus an at-most-one external commit for the other stage).
 *
 * `promptFn` returns the proposed new name or `null` when the user cancels.
 * Defaults to `window.prompt`; tests inject a stub.
 *
 * Pass `crossStage` to opt into Phase 28 cross-stage behaviour. When omitted
 * the function preserves the original Phase 27 single-document path so unit
 * tests and ComputeNode editors keep working unchanged.
 */
export function runRename(
  view: EditorView,
  promptFn: (current: string) => string | null = (cur) =>
    window.prompt("Rename to:", cur),
  crossStage?: CrossStageRenameContext,
): RenameResult {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const ident = identifierAt(line.text, line.from, pos);
  if (!ident) return { applied: false, reason: "not-on-identifier" };

  const source = view.state.doc.toString();
  // Probe references before prompting so we can bail early on "cursor is on a
  // builtin / unknown identifier" without showing a useless prompt.
  const { localSites, otherSites } = collectSites(
    source,
    ident.word,
    line.number,
    crossStage,
  );
  if (localSites.length === 0 && otherSites.length === 0) {
    return { applied: false, reason: "no-binding" };
  }

  const next = promptFn(ident.word);
  if (next == null) return { applied: false, reason: "prompt-cancelled" };
  if (next === ident.word) return { applied: false, reason: "unchanged" };
  const v = validateRenameName(next);
  if (!v.ok) return { applied: false, reason: "invalid-name" };

  // When cross-stage hit additional sites we commit BOTH stages to the graph
  // store in a single patch — that's the single graph-history entry covering
  // the whole rename. The subsequent CM dispatch then provides the CM-level
  // undo for the visible doc; the 50ms commit debounce in CodeEditor sees the
  // store already holds the value and early-returns, so no extra push lands.
  if (crossStage && otherSites.length > 0) {
    const newOrigin = applyEdits(source, localSites, next);
    const newOther = applyEdits(crossStage.otherStageSource, otherSites, next);
    crossStage.applyBothStages(newOrigin, newOther);
  }

  view.dispatch({
    changes: localSites.map((s) => ({ from: s.from, to: s.to, insert: next })),
  });
  return {
    applied: true,
    sites: localSites.length + otherSites.length,
    otherStageSites: otherSites.length,
    newName: next,
  };
}

function collectSites(
  source: string,
  word: string,
  atLine: number,
  crossStage: CrossStageRenameContext | undefined,
): {
  localSites: CrossStageReferenceSite[];
  otherSites: CrossStageReferenceSite[];
} {
  if (!crossStage) {
    // Single-document path — Phase 27 behaviour. Origin stage is a label only;
    // the dispatch below treats every site as a local doc edit.
    const sites = findReferences(source, word, atLine).map(
      (s): CrossStageReferenceSite => ({ ...s, stage: "fragment" }),
    );
    return { localSites: sites, otherSites: [] };
  }
  const sources =
    crossStage.originStage === "vertex"
      ? { vertex: source, fragment: crossStage.otherStageSource }
      : { vertex: crossStage.otherStageSource, fragment: source };
  const cross = findReferencesAcrossStages(
    sources,
    word,
    crossStage.originStage,
    atLine,
  );
  const localSites: CrossStageReferenceSite[] = [];
  const otherSites: CrossStageReferenceSite[] = [];
  for (const s of cross) {
    if (s.stage === crossStage.originStage) localSites.push(s);
    else otherSites.push(s);
  }
  return { localSites, otherSites };
}

/**
 * Rewrite `source` with `newName` substituted at every site. Sites must be
 * in ascending document order and non-overlapping — both invariants hold for
 * results returned by {@link findReferencesAcrossStages}.
 */
function applyEdits(
  source: string,
  sites: ReadonlyArray<{ from: number; to: number }>,
  newName: string,
): string {
  let out = "";
  let cursor = 0;
  for (const s of sites) {
    out += source.slice(cursor, s.from) + newName;
    cursor = s.to;
  }
  out += source.slice(cursor);
  return out;
}

/**
 * Look up the live cross-stage context for the currently-edited ShaderNode.
 * Returns `undefined` when the selection is on a non-shader node (Compute,
 * Param, no node, etc.) — the caller falls back to the single-document
 * rename path in that case.
 *
 * The atomicity guarantee (single graph-history entry) is encoded here:
 * `applyBothStages` ships ONE `updateShaderSource` patch carrying the new
 * source for both stages, so graph history records a single entry regardless
 * of how many stages were touched.
 */
function resolveCrossStageContext(): CrossStageRenameContext | undefined {
  const selectedId = useSelectionStore.getState().selectedNodeId;
  if (!selectedId) return undefined;
  const node = useGraphStore
    .getState()
    .nodes.find((n) => n.id === selectedId) as
    | ShaderGraphNode
    | ComputeGraphNode
    | undefined;
  if (!node || node.kind !== "shader") return undefined;

  const sn = node;
  const originStage = useEditorStore.getState().activeStage;
  const otherStageSource =
    originStage === "vertex" ? sn.fragmentSource : sn.vertexSource;

  return {
    originStage,
    otherStageSource,
    applyBothStages(newOrigin, newOther) {
      const patch =
        originStage === "vertex"
          ? { vertexSource: newOrigin, fragmentSource: newOther }
          : { vertexSource: newOther, fragmentSource: newOrigin };
      useGraphStore.getState().updateShaderSource(sn.id, patch);
    },
  };
}

/** Bundled CodeMirror keymap extension — F2 to rename. */
export function glslRename() {
  return keymap.of([
    {
      key: "F2",
      run: (view) => {
        const ctx = resolveCrossStageContext();
        return runRename(view, undefined, ctx).applied;
      },
    },
  ]);
}

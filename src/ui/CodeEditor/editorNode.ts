/**
 * Single source of truth for **which graph node the Code editor is bound to**
 * (review #10).
 *
 * The Code panel does not require a selection: with nothing selected it falls
 * back to the first `shader` node in the graph so the editor is never blank on
 * a fresh project. Before this module that rule lived only inside
 * `CodeEditor/index.tsx` (`selectedId ?? firstShaderId`), while `rename.ts`
 * resolved its cross-stage context from `selectionStore.selectedNodeId` alone
 * — so with no selection F2 rewrote the *visible* document through the
 * single-document path and never touched the paired stage, silently producing
 * a half-renamed program.
 *
 * ## Why its own module
 * `rename.ts` cannot import `CodeEditor/index.tsx`: that closes the cycle
 * `rename.ts → index.tsx → glslSetup.ts → rename.ts`, which `npm run circular`
 * (dpdm) rejects as a hard gate. This file is a leaf that nothing inside the
 * graph/glsl core imports, so no back-edge can route through it.
 *
 * Consumers use whichever of the two shapes fits:
 *   - `pickEditorNodeId(selectedId, nodes)` — pure; `index.tsx` calls it
 *     **inside** its zustand selector so the component stays reactive to both
 *     the selection and the node list.
 *   - `currentEditorNodeId()` — thin `getState()` read of the same rule, for
 *     imperative call sites (the F2 keymap) that have no React context.
 */

import type { GraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";

/**
 * Resolve the node the Code editor edits: the primary selection when there is
 * one, otherwise the first `shader` node in graph order (or `null` when the
 * graph has none).
 *
 * Note the fallback deliberately does **not** consider `compute` nodes — an
 * unselected compute node is not auto-opened; that matches the pre-existing
 * `nodes.find((n) => n.kind === "shader")` behaviour this replaced.
 */
export function pickEditorNodeId(
  selectedId: string | null,
  nodes: readonly GraphNode[],
): string | null {
  if (selectedId !== null) return selectedId;
  return nodes.find((n) => n.kind === "shader")?.id ?? null;
}

/** {@link pickEditorNodeId} against the live stores. */
export function currentEditorNodeId(): string | null {
  return pickEditorNodeId(
    useSelectionStore.getState().selectedNodeId,
    useGraphStore.getState().nodes,
  );
}

import { useEffect } from "react";
import { redoGraph, undoGraph, useGraphStore } from "../state/graphStore";
import { useSelectionStore } from "../state/selectionStore";
import { useTimeStore } from "../state/timeStore";

/**
 * Global keyboard shortcuts. Mounted once at the App root.
 *
 *   Cmd/Ctrl+Z         — undo
 *   Cmd/Ctrl+Shift+Z   — redo (also Cmd+Y on Windows-style)
 *   Cmd/Ctrl+D         — duplicate the selected node
 *   Cmd/Ctrl+A         — select every node (when not editing text)
 *   Cmd/Ctrl+G         — wrap the current selection in a new group
 *   Arrow keys         — nudge the whole selection (Shift = coarse step)
 *   Space              — toggle play/pause (when no text input has focus)
 */

/** Flow-coordinate distance for a single arrow-key nudge; Shift multiplies. */
const NUDGE_STEP = 10;
const NUDGE_STEP_COARSE = 40;

const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // Inside CodeMirror?
  if (target.closest(".cm-editor")) return true;
  return false;
}

export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoGraph();
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "z") ||
        (mod && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redoGraph();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "d") {
        // Leave editor multi-cursor (Cmd+D) alone while typing.
        if (isEditingTarget(e.target)) return;
        e.preventDefault();
        const sel = useSelectionStore.getState().selectedNodeId;
        if (!sel) return;
        const newId = useGraphStore.getState().cloneNode(sel);
        if (newId) useSelectionStore.getState().select(newId);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "a") {
        // Leave native select-all alone inside text fields / CodeMirror.
        if (isEditingTarget(e.target)) return;
        e.preventDefault();
        const ids = useGraphStore.getState().nodes.map((n) => n.id);
        useSelectionStore.getState().setSelectedIds(ids);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "g") {
        // Cmd+G: wrap selection in a group. Skip while typing so browser
        // "find next" (which is Cmd+G) stays available when an input has focus.
        if (isEditingTarget(e.target)) return;
        const sel = useSelectionStore.getState().selectedNodeIds;
        if (sel.length < 2) return;
        e.preventDefault();
        const newId = useGraphStore.getState().groupSelected(sel);
        if (newId) useSelectionStore.getState().select(newId);
        return;
      }
      const arrow = ARROW_DELTAS[e.key];
      if (arrow && !mod && !isEditingTarget(e.target)) {
        // React Flow moves the selection natively when a node / the selection
        // box has keyboard focus (it calls preventDefault). Only step in when
        // it didn't — e.g. after a mouse selection, where nothing is focused.
        if (e.defaultPrevented) return;
        const ids = useSelectionStore.getState().selectedNodeIds;
        if (ids.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
        useGraphStore
          .getState()
          .nudgeNodes(ids, arrow.dx * step, arrow.dy * step);
        return;
      }
      if (e.key === " " && !isEditingTarget(e.target)) {
        e.preventDefault();
        useTimeStore.getState().togglePlaying();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

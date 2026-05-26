/**
 * Module-level reference to the currently mounted CodeMirror EditorView.
 *
 * The CodeEditor React component owns the lifecycle and calls
 * `setCurrentView(view)` on mount and `setCurrentView(null)` on unmount.
 * Callers — currently only the DEV bridge in `main.tsx` — read this through
 * `getCurrentView()` to introspect cursor / selection state in tests without
 * adding another store or prop drill.
 *
 * Production code paths must NOT depend on this — the React component owns
 * the canonical view reference. The intent is strictly observability.
 */

import type { EditorView } from "@codemirror/view";

let view: EditorView | null = null;

export function setCurrentView(v: EditorView | null): void {
  view = v;
}

export function getCurrentView(): EditorView | null {
  return view;
}

/**
 * Convenience accessor used by E2E specs — returns the 1-based line number of
 * the cursor's primary head, or `null` when no editor is mounted.
 */
export function getCursorLine(): number | null {
  if (!view) return null;
  const pos = view.state.selection.main.head;
  return view.state.doc.lineAt(pos).number;
}

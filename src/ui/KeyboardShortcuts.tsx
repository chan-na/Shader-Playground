import { useEffect } from 'react';
import { redoGraph, undoGraph } from '../state/graphStore';
import { useTimeStore } from '../state/timeStore';

/**
 * Global keyboard shortcuts. Mounted once at the App root.
 *
 *   Cmd/Ctrl+Z         — undo
 *   Cmd/Ctrl+Shift+Z   — redo (also Cmd+Y on Windows-style)
 *   Space              — toggle play/pause (when no text input has focus)
 */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // Inside CodeMirror?
  if (target.closest('.cm-editor')) return true;
  return false;
}

export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoGraph();
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (mod && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redoGraph();
        return;
      }
      if (e.key === ' ' && !isEditingTarget(e.target)) {
        e.preventDefault();
        useTimeStore.getState().togglePlaying();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

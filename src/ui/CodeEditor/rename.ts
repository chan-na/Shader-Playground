/**
 * Rename refactor for GLSL editors (Phase 27).
 *
 * F2 on an identifier prompts for a new name, then dispatches every reference
 * site as a single transaction so the whole rename is one undo step.
 *
 * Scope: same-document only — GLSL has no imports or cross-file linkage. The
 * scope rules of `findReferences` mean a global rename will not touch a
 * shadowed local of the same name, and a local rename leaves the global
 * untouched.
 *
 * The prompt UX uses the browser's `window.prompt` for the lowest-friction
 * path. Tests inject a custom `promptFn` to avoid the modal.
 */

import { type EditorView, keymap } from "@codemirror/view";
import { findReferences } from "../../core/glsl/references";
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
 * Outcome of {@link runRename}. The result is purely informational — the
 * editor has already been mutated when `applied` is true.
 */
export type RenameResult =
  | { applied: true; sites: number; newName: string }
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
 * been dispatched as one transaction (single undo step).
 *
 * `promptFn` returns the proposed new name or `null` when the user cancels.
 * Defaults to `window.prompt`; tests inject a stub.
 */
export function runRename(
  view: EditorView,
  promptFn: (current: string) => string | null = (cur) =>
    window.prompt("Rename to:", cur),
): RenameResult {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const ident = identifierAt(line.text, line.from, pos);
  if (!ident) return { applied: false, reason: "not-on-identifier" };

  const source = view.state.doc.toString();
  const sites = findReferences(source, ident.word, line.number);
  if (sites.length === 0) return { applied: false, reason: "no-binding" };

  const next = promptFn(ident.word);
  if (next == null) return { applied: false, reason: "prompt-cancelled" };
  if (next === ident.word) return { applied: false, reason: "unchanged" };
  const v = validateRenameName(next);
  if (!v.ok) return { applied: false, reason: "invalid-name" };

  view.dispatch({
    changes: sites.map((s) => ({ from: s.from, to: s.to, insert: next })),
  });
  return { applied: true, sites: sites.length, newName: next };
}

/** Bundled CodeMirror keymap extension — F2 to rename. */
export function glslRename() {
  return keymap.of([
    {
      key: "F2",
      run: (view) => runRename(view).applied,
    },
  ]);
}

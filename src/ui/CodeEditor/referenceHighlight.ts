/**
 * Active reference highlight for GLSL editors (Phase 27).
 *
 * When the cursor sits on an identifier, every other reference to the same
 * declaration in the same document is decorated with a subtle background
 * (`.cm-glsl-ref-occurrence`). The declaration site itself is tagged with a
 * second class (`.cm-glsl-ref-definition`) so the editor can distinguish "this
 * is where it lives" from "this is another use".
 *
 * The field rebuilds on `docChanged || selectionSet`. The classifier is a
 * single regex pass over the source plus `resolveSymbol` per occurrence, so
 * recomputing on cursor move is cheap for playground-sized shaders (< 1 ms).
 *
 * No surface is shown when the cursor is between tokens, on a builtin/keyword
 * without a source binding, or when the symbol has only one occurrence (the
 * decl itself — there's nothing to "find").
 */

import { type EditorState, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { findReferences } from "../../core/glsl/references";
import { identifierAt } from "./hover";

const occurrenceDeco = Decoration.mark({ class: "cm-glsl-ref-occurrence" });
const definitionDeco = Decoration.mark({ class: "cm-glsl-ref-definition" });

/**
 * Build the decoration set for the current cursor position. Exported for
 * tests; the StateField below calls it from `create` and `update`.
 */
export function buildReferenceDecorations(state: EditorState): DecorationSet {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const ident = identifierAt(line.text, line.from, pos);
  if (!ident) return Decoration.none;
  const sites = findReferences(state.doc.toString(), ident.word, line.number);
  // Only paint when there are at least two sites — a single decl with no uses
  // is visual noise.
  if (sites.length < 2) return Decoration.none;
  const ranges: Range<Decoration>[] = sites.map((s) =>
    (s.isDefinition ? definitionDeco : occurrenceDeco).range(s.from, s.to),
  );
  return Decoration.set(ranges, true);
}

/**
 * CodeMirror extension. Mount once via `glslExtensions()`. The field's value
 * is the active `DecorationSet`; CM applies it on every render through the
 * `provide` accessor.
 */
export function glslReferenceHighlight() {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildReferenceDecorations(state);
    },
    update(deco, tr) {
      if (!tr.docChanged && !tr.selection) return deco;
      return buildReferenceDecorations(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

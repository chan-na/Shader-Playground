/**
 * Go-to-definition for GLSL editors (Phase 27).
 *
 * Resolves the identifier under the cursor to its declaration via
 * `resolveSymbol` and jumps the editor cursor there. Surfaces:
 *   - **F12** keymap binding — runs against the current main-selection head.
 *   - **Cmd/Ctrl+Click** on a token — uses `posAtCoords` to convert the
 *     mouse coordinates to a doc offset, then jumps.
 *
 * Unknown identifiers (builtins like `sin`, keywords like `for`, or names
 * with no in-scope binding) silently no-op rather than showing a tooltip —
 * the user can already use Hover for that information.
 */

import { EditorSelection } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { buildSymbolTable, resolveSymbol } from "../../core/glsl/symbolTable";
import { identifierAt } from "./hover";

export interface DefinitionTarget {
  /** Absolute document offset where the declaration identifier starts. */
  from: number;
  /** Absolute document offset where the declaration identifier ends. */
  to: number;
  /** 1-based line number of the declaration. */
  line: number;
  /** 1-based column where the identifier starts on its line. */
  column: number;
}

/**
 * Resolve the identifier at `pos` to its declaration. Pure helper, exported
 * for tests — the CM extension below calls it with `view.state` then dispatches
 * a selection + scroll effect.
 */
export function findDefinitionAt(
  view: EditorView,
  pos: number,
): DefinitionTarget | null {
  const lineObj = view.state.doc.lineAt(pos);
  const ident = identifierAt(lineObj.text, lineObj.from, pos);
  if (!ident) return null;
  const source = view.state.doc.toString();
  const table = buildSymbolTable(source);
  const sym = resolveSymbol(table, ident.word, lineObj.number);
  if (!sym) return null;
  const doc = view.state.doc;
  // Clamp defensively — a stale symbol table from an editor mid-transaction
  // could point past the current end.
  const lineNo = Math.max(1, Math.min(doc.lines, sym.line));
  const declLine = doc.line(lineNo);
  const colOffset = Math.min(declLine.length, Math.max(0, sym.column - 1));
  const from = declLine.from + colOffset;
  const to = Math.min(declLine.to, from + sym.name.length);
  return { from, to, line: sym.line, column: sym.column };
}

/**
 * Execute the jump. Returns true when a definition was found, false otherwise
 * (cursor not on an identifier, or identifier has no source-level binding).
 */
export function gotoDefinition(view: EditorView, pos: number): boolean {
  const def = findDefinitionAt(view, pos);
  if (!def) return false;
  view.dispatch({
    selection: EditorSelection.cursor(def.from),
    effects: EditorView.scrollIntoView(def.from, { y: "center" }),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/**
 * Bundled CodeMirror extension — F12 keymap entry + Cmd/Ctrl+Click handler.
 * The click handler only fires when the modifier is held so plain clicks
 * retain CodeMirror's default selection behaviour.
 */
export function glslGotoDefinition() {
  return [
    keymap.of([
      {
        key: "F12",
        run: (view) => gotoDefinition(view, view.state.selection.main.head),
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod || event.button !== 0) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        if (gotoDefinition(view, pos)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    }),
  ];
}

/**
 * CodeMirror 6 semantic highlight layer for GLSL (Phase 26).
 *
 * Wraps `classifySemanticTokens` in a `ViewPlugin` that emits a
 * `DecorationSet` of `Decoration.mark` ranges. Each token gets a
 * `cm-glsl-token-<kind>` class; the corresponding colors live in the dark
 * theme rules added to `glslSetup.ts`.
 *
 * Cost control:
 *   - We only build decorations for ranges inside `view.visibleRanges`, so a
 *     1000-line shader still produces O(visible-lines) ranges.
 *   - Rebuild fires on `update.docChanged || update.viewportChanged` — the
 *     classifier is a single regex pass plus a symbol-table walk (<1ms for
 *     playground-sized shaders), so we don't add an explicit debounce.
 *   - Tokens are emitted in document order by `classifySemanticTokens`, so
 *     `RangeSetBuilder.add` accepts them without an extra sort.
 *
 * The plugin keeps the existing `glsl()` language pack and
 * `defaultHighlightStyle` underneath untouched — it only paints
 * *identifiers*. Keywords, types, numbers, operators remain styled by the
 * lexer-based path.
 */

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  classifySemanticTokens,
  type SemanticToken,
} from "../../core/glsl/semanticTokens";

/**
 * Build the decoration set for the visible part of the document. Exported
 * for testability — the plugin below calls this on construction and on
 * every relevant update.
 */
export function buildSemanticDecorations(view: EditorView): DecorationSet {
  const source = view.state.doc.toString();
  const tokens = classifySemanticTokens(source);
  if (tokens.length === 0) return Decoration.none;

  // Pre-cache the Decoration.mark per kind so we don't allocate a new object
  // for every token. CodeMirror dedupes identical decorations internally,
  // but reusing the same instance is friendlier to the RangeSet diff.
  const cache = new Map<string, Decoration>();
  const getDeco = (kind: SemanticToken["kind"]): Decoration => {
    const hit = cache.get(kind);
    if (hit) return hit;
    const deco = Decoration.mark({ class: `cm-glsl-token-${kind}` });
    cache.set(kind, deco);
    return deco;
  };

  const builder = new RangeSetBuilder<Decoration>();
  // `view.visibleRanges` is sorted and non-overlapping; tokens are sorted by
  // start offset. Walk both in lockstep so we only touch in-range tokens.
  let tIdx = 0;
  for (const range of view.visibleRanges) {
    // Advance past tokens that end before this range starts. Bounded by
    // tokens.length so noUncheckedIndexedAccess gives us a safe peek.
    for (;;) {
      const peek = tokens[tIdx];
      if (!peek || peek.to > range.from) break;
      tIdx++;
    }
    for (;;) {
      const t = tokens[tIdx];
      if (!t || t.from >= range.to) break;
      // Skip tokens that begin before the range (rare — they could straddle
      // a fold gap; cheap to skip rather than clip).
      if (t.from >= range.from && t.to <= range.to) {
        builder.add(t.from, t.to, getDeco(t.kind));
      }
      tIdx++;
    }
  }
  return builder.finish();
}

/**
 * CodeMirror extension factory. Mount once per editor via
 * `glslExtensions()` — the plugin's `decorations` accessor returns the
 * current `DecorationSet` and CM applies it on every render.
 */
export function glslSemanticHighlight() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildSemanticDecorations(view);
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = buildSemanticDecorations(u.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

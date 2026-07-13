/**
 * GLSL editor theme — CodeMirror 6 `HighlightStyle` + chrome (gutters,
 * tooltips, autocomplete popup, semantic-token/reference-highlight colors).
 *
 * All values are derived from `tokens` in `src/theme.ts` — no raw hex/px
 * color literals here. See `design/README.md` §D and `design/Code
 * Editor.dc.html` for the visual reference this file reimplements.
 *
 * Follows the "token-derivation module + companion test" pattern used by
 * `src/ui/NodeEditor/nodeTheme.ts`.
 */

import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { tokens, withAlpha } from "../../theme";

/**
 * GLSL syntax `HighlightStyle` — maps lezer highlight tags to
 * `tokens.syntax.*`. design/README.md §D: "위 syntax 색으로 HighlightStyle
 * 커스텀".
 */
export const glslHighlightStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.processingInstruction, t.macroName],
    color: tokens.syntax.keyword,
  },
  { tag: [t.typeName, t.standard(t.typeName)], color: tokens.syntax.type },
  {
    tag: [t.variableName, t.propertyName, t.attributeName],
    color: tokens.syntax.variable,
  },
  {
    tag: [t.function(t.variableName), t.definition(t.function(t.variableName))],
    color: tokens.syntax.function,
  },
  { tag: [t.number, t.bool], color: tokens.syntax.number },
  { tag: t.comment, color: tokens.syntax.comment },
  { tag: t.string, color: tokens.syntax.string },
]);

const selectionTint = withAlpha(tokens.accent.default, 0.3);

/**
 * Editor chrome spec — gutters, active line, selection, lint underlines,
 * tooltips, autocomplete popup, semantic-token classes, ref-highlight
 * classes. Passed to `EditorView.theme()` below and exported separately so
 * tests can assert on individual rules without instantiating CodeMirror.
 */
export const EDITOR_CHROME: Record<string, Record<string, string>> = {
  "&": {
    backgroundColor: tokens.surface.app,
    color: tokens.text.primary,
    height: "100%",
  },
  ".cm-content": {
    fontFamily: tokens.font.mono,
    fontSize: "12.5px",
    lineHeight: "22px",
    caretColor: tokens.accent.default,
  },
  ".cm-cursor": {
    borderLeftColor: tokens.accent.default,
  },
  ".cm-gutters": {
    backgroundColor: tokens.surface.app,
    color: tokens.text.disabled,
    border: "none",
    fontFamily: tokens.font.mono,
  },
  ".cm-activeLine": {
    backgroundColor: withAlpha(tokens.accent.default, 0.07),
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: tokens.text.brightBody,
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: `${selectionTint} !important`,
  },
  ".cm-content ::selection": {
    backgroundColor: `${selectionTint} !important`,
  },
  ".cm-foldGutter .cm-gutterElement": {
    color: tokens.text.muted,
  },

  // Inline diagnostic underlines (dc helmet L19-20 .ce-err/.ce-warn). Gutter
  // marker SVGs keep CodeMirror's built-in error/warning colors.
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: `underline wavy ${tokens.semantic.error}`,
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: `underline wavy ${tokens.semantic.warning}`,
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },

  // Tooltips (hover + diagnostics + autocomplete share this shell).
  ".cm-tooltip": {
    backgroundColor: tokens.surface.nodeCardSolid,
    border: `1px solid ${tokens.border.strong}`,
    color: tokens.text.brightBody,
    borderRadius: `${tokens.radius.overlay}px`,
    boxShadow: tokens.shadow.overlayBar,
    overflow: "hidden",
  },
  ".cm-diagnostic": {
    padding: "9px 12px",
    fontFamily: tokens.font.ui,
    fontSize: "11.5px",
  },
  ".cm-diagnostic-error": {
    borderLeft: `3px solid ${tokens.semantic.error}`,
  },
  ".cm-diagnostic-warning": {
    borderLeft: `3px solid ${tokens.semantic.warning}`,
  },

  // Autocomplete popup.
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: tokens.font.mono,
    fontSize: "11.5px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "6px 11px",
    color: tokens.text.primary,
    borderLeft: "2px solid transparent",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: withAlpha(tokens.accent.default, 0.14),
    borderLeft: `2px solid ${tokens.accent.default}`,
    color: tokens.text.primary,
  },
  ".cm-completionDetail": {
    fontFamily: tokens.font.mono,
    fontSize: "10px",
    color: tokens.text.muted,
    fontStyle: "normal",
  },
  ".cm-completionIcon": {
    color: tokens.text.secondary,
  },

  // Phase 26 — semantic token colors, painted on top of the lexer-based
  // syntax highlight so only identifier roles are recolored. Class names are
  // load-bearing (asserted by tests/e2e/phase-26-semantic-tokens.spec.ts) —
  // do not rename.
  ".cm-glsl-token-uniform": { color: tokens.syntax.variable },
  ".cm-glsl-token-system-uniform": { color: tokens.semantic.warning },
  ".cm-glsl-token-in": { color: tokens.syntax.variable },
  ".cm-glsl-token-out": { color: tokens.syntax.variable },
  ".cm-glsl-token-attribute": { color: tokens.syntax.variable },
  ".cm-glsl-token-varying": { color: tokens.syntax.variable },
  ".cm-glsl-token-const": { color: tokens.syntax.keyword },
  ".cm-glsl-token-parameter": { color: tokens.syntax.variable },
  ".cm-glsl-token-struct-type": { color: tokens.syntax.type },
  ".cm-glsl-token-function-user": { color: tokens.syntax.function },
  ".cm-glsl-token-function-builtin": { color: tokens.syntax.function },

  // Phase 27 — cursor-aware reference highlight. Class names are
  // load-bearing (asserted by tests/e2e/phase-27-glsl-refs-rename.spec.ts) —
  // do not rename.
  ".cm-glsl-ref-occurrence": {
    backgroundColor: withAlpha(tokens.accent.default, 0.16),
    borderRadius: "2px",
  },
  ".cm-glsl-ref-definition": {
    backgroundColor: withAlpha(tokens.accent.default, 0.16),
    borderRadius: "2px",
    outline: `1px solid ${withAlpha(tokens.accent.default, 0.35)}`,
  },
};

export const editorChromeTheme = EditorView.theme(EDITOR_CHROME, {
  dark: true,
});

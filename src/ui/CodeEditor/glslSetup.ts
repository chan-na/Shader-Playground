import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { glsl } from "codemirror-lang-glsl";
import { glslAutocomplete } from "./autocomplete";
import { glslHoverTooltip } from "./hover";
import { glslSemanticHighlight } from "./semanticHighlight";

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#fff",
      fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace",
      fontSize: "12px",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#666",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "#2a2a2d",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#2a2a2d",
    },
    ".cm-cursor": {
      borderLeftColor: "#fff",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "#264f78 !important",
    },
    ".cm-tooltip": {
      backgroundColor: "#252526",
      border: "1px solid #555",
      color: "#ddd",
    },
    ".cm-diagnostic-error": {
      borderLeft: "3px solid #f48771",
    },
    ".cm-diagnostic-warning": {
      borderLeft: "3px solid #cca700",
    },
    // Phase 26 — semantic token colors. Painted on top of the lexer-based
    // syntax highlight so storage/control keywords keep their default style
    // and only identifier roles are recolored. Palette mirrors the VS Code
    // Dark+ convention used elsewhere in this repo (Inspector chips, hover
    // signatures).
    ".cm-glsl-token-uniform": { color: "#4ec9b0" },
    ".cm-glsl-token-system-uniform": { color: "#ff9d00" },
    ".cm-glsl-token-in": { color: "#9cdcfe" },
    ".cm-glsl-token-out": { color: "#9cdcfe" },
    ".cm-glsl-token-attribute": { color: "#9cdcfe" },
    ".cm-glsl-token-varying": { color: "#9cdcfe" },
    ".cm-glsl-token-const": { color: "#c586c0" },
    ".cm-glsl-token-parameter": { color: "#9cdcfe" },
    ".cm-glsl-token-struct-type": { color: "#4ec9b0" },
    ".cm-glsl-token-function-user": { color: "#dcdcaa" },
    ".cm-glsl-token-function-builtin": { color: "#7adba8" },
  },
  { dark: true },
);

export function glslExtensions(): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    history(),
    drawSelection(),
    bracketMatching(),
    indentOnInput(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    lintGutter(),
    glsl(),
    glslAutocomplete(),
    glslHoverTooltip(),
    glslSemanticHighlight(),
    darkTheme,
    EditorView.lineWrapping,
  ];
}

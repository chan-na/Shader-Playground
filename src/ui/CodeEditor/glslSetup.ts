import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
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
import { editorChromeTheme, glslHighlightStyle } from "./editorTheme";
import { glslGotoDefinition } from "./gotoDef";
import { glslHoverTooltip } from "./hover";
import { glslReferenceHighlight } from "./referenceHighlight";
import { glslRename } from "./rename";
import { glslSemanticHighlight } from "./semanticHighlight";

export function glslExtensions(): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    history(),
    drawSelection(),
    bracketMatching(),
    indentOnInput(),
    highlightActiveLine(),
    syntaxHighlighting(glslHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    lintGutter(),
    glsl(),
    glslAutocomplete(),
    glslHoverTooltip(),
    glslSemanticHighlight(),
    glslReferenceHighlight(),
    glslGotoDefinition(),
    glslRename(),
    editorChromeTheme,
    EditorView.lineWrapping,
  ];
}

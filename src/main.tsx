import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  setAudioBlobResolver,
  setVideoBlobResolver,
} from "./core/external/registry";
import { BUILTIN_FUNCTIONS, KEYWORD_DESCRIPTIONS } from "./core/glsl/builtins";
import { glslValidator } from "./core/glsl/glslValidator";
import { findReferences } from "./core/glsl/references";
import {
  classifyIdentifier,
  classifySemanticTokens,
} from "./core/glsl/semanticTokens";
import {
  buildSymbolTable,
  resolveSymbol,
  symbolsVisibleAt,
} from "./core/glsl/symbolTable";
import { getCurrentView, getCursorLine } from "./ui/CodeEditor/currentView";
import "./index.css";
import * as assetActions from "./state/assetActions";
import { getAudioBlob, getVideoBlob, useAssetStore } from "./state/assetStore";
import { useCameraStore } from "./state/cameraStore";
import { useDiagnosticsStore } from "./state/diagnosticsStore";
import { useEditorStore } from "./state/editorStore";
import { useGpuTimerStore } from "./state/gpuTimerStore";
import { useGraphStore } from "./state/graphStore";
import { useHistoryStore } from "./state/historyStore";
import { useMouseStore } from "./state/mouseStore";
import { useRendererStore } from "./state/rendererStore";
import { useSelectionStore } from "./state/selectionStore";
import { useTimeStore } from "./state/timeStore";
import { useViewportStore } from "./state/viewportStore";
import { log, normalizeError } from "./utils/log";

// 전역 안전망: 잡히지 않은 에러/거부를 로거에 기록 (Debugging-Plan P2).
window.addEventListener("error", (e) => {
  log.error("app", "window.onerror", {
    message: e.message,
    error: normalizeError(e.error),
  });
});
window.addEventListener("unhandledrejection", (e) => {
  log.error("app", "unhandledrejection", {
    reason: normalizeError(e.reason),
  });
});

// Wire the external registry's video blob lookup to the in-memory asset
// store. Kept here (not in the registry or store) so neither layer needs to
// import the other; registry stays free of state dependencies.
setVideoBlobResolver(getVideoBlob);
setAudioBlobResolver(getAudioBlob);

if (import.meta.env.DEV) {
  // Expose stores for debugging / Playwright-style verification.
  (window as unknown as { __sp: unknown }).__sp = {
    graph: useGraphStore,
    selection: useSelectionStore,
    assets: useAssetStore,
    assetActions,
    diagnostics: useDiagnosticsStore,
    time: useTimeStore,
    viewport: useViewportStore,
    history: useHistoryStore,
    editor: useEditorStore,
    camera: useCameraStore,
    mouse: useMouseStore,
    renderer: useRendererStore,
    gpuTimer: useGpuTimerStore,
    glslValidator,
    // Phase 25 — LSP helpers exposed for E2E. Tests build a symbol table
    // from a source string and resolve identifiers without round-tripping
    // through CodeMirror.
    glslSymbols: {
      build: buildSymbolTable,
      visibleAt: symbolsVisibleAt,
      resolve: resolveSymbol,
      builtins: BUILTIN_FUNCTIONS,
      keywords: KEYWORD_DESCRIPTIONS,
      // Phase 27 — reference finder. E2E can ask for every occurrence of a
      // symbol at a given line without round-tripping through CodeMirror.
      findReferences,
    },
    // Phase 26 — semantic token classifier exposed for E2E. Tests can drive
    // `classify(source)` without going through the CodeMirror ViewPlugin to
    // verify token kinds and offsets directly.
    glslSemanticTokens: {
      classify: classifySemanticTokens,
      classifyIdentifier,
    },
    // Phase 27 — CodeMirror observation hook. Tests read cursor state /
    // dispatch focus on the active editor without owning the React ref.
    codeEditor: {
      getCursorLine,
      focus: () => {
        getCurrentView()?.focus();
      },
    },
    log,
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  setAudioBlobResolver,
  setVideoBlobResolver,
} from "./core/external/registry";
import "./index.css";
import * as assetActions from "./state/assetActions";
import { getAudioBlob, getVideoBlob, useAssetStore } from "./state/assetStore";
import { useCameraStore } from "./state/cameraStore";
import { useDiagnosticsStore } from "./state/diagnosticsStore";
import { useEditorStore } from "./state/editorStore";
import { useGpuTimerStore } from "./state/gpuTimerStore";
import { useGraphStore } from "./state/graphStore";
import { useHistoryStore } from "./state/historyStore";
import { useRendererStore } from "./state/rendererStore";
import { useSelectionStore } from "./state/selectionStore";
import { useTimeStore } from "./state/timeStore";
import { useViewportStore } from "./state/viewportStore";

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
    renderer: useRendererStore,
    gpuTimer: useGpuTimerStore,
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

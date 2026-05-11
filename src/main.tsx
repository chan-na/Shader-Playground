import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import * as assetActions from "./state/assetActions";
import { useAssetStore } from "./state/assetStore";
import { useDiagnosticsStore } from "./state/diagnosticsStore";
import { useEditorStore } from "./state/editorStore";
import { useGraphStore } from "./state/graphStore";
import { useHistoryStore } from "./state/historyStore";
import { useSelectionStore } from "./state/selectionStore";
import { useTimeStore } from "./state/timeStore";
import { useViewportStore } from "./state/viewportStore";

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
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

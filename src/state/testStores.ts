// Test-only: put every app store back to its creation-time state. The stores
// are module singletons, so panel/overlay tests that mount components reading
// several of them reset all of them between cases instead of each file
// keeping its own list (and silently leaking whichever store it forgot).
//
// `getInitialState()` is zustand's snapshot of the state the store was created
// with; replacing (`true`) rather than merging also drops any keys a test
// added. This deliberately does not go through each store's own `reset()`
// action: those bump `rev`/`graphEpoch` and push undo history, which is app
// behavior, not test isolation.
import type { StoreApi } from "zustand";
import { useDockStore } from "../ui/dock/dockStore";
import { useAssetStore } from "./assetStore";
import { useBootstrapStore } from "./bootstrapStore";
import { useDebugUiStore } from "./debugUiStore";
import { useDiagnosticsStore } from "./diagnosticsStore";
import { useEditorStore } from "./editorStore";
import { useGpuTimerStore } from "./gpuTimerStore";
import { useGraphStore } from "./graphStore";
import { useHistoryStore } from "./historyStore";
import { useMouseStore } from "./mouseStore";
import { usePassPlanStore } from "./passPlanStore";
import { useRendererStore } from "./rendererStore";
import { useSelectionStore } from "./selectionStore";
import { useTimeStore } from "./timeStore";

function resetToInitial<T>(store: StoreApi<T>): void {
  store.setState(store.getInitialState(), true);
}

export function resetAllStores(): void {
  resetToInitial(useAssetStore);
  resetToInitial(useBootstrapStore);
  resetToInitial(useDebugUiStore);
  resetToInitial(useDiagnosticsStore);
  resetToInitial(useDockStore);
  resetToInitial(useEditorStore);
  resetToInitial(useGpuTimerStore);
  resetToInitial(useGraphStore);
  resetToInitial(useHistoryStore);
  resetToInitial(useMouseStore);
  resetToInitial(usePassPlanStore);
  resetToInitial(useRendererStore);
  resetToInitial(useSelectionStore);
  resetToInitial(useTimeStore);
}

import { useEffect, useRef, useState } from "react";
import { hydrateGraphAssets } from "../state/assetActions";
import { clearSession, loadSession, startAutoSave } from "../state/autoSave";
import { useBootstrapStore } from "../state/bootstrapStore";
import { createDemoGraph, DEMO_LAYOUT } from "../state/demoGraph";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import {
  deserializeProject,
  type SerializedProject,
} from "../state/serialization";
import { log, normalizeError } from "../utils/log";
import { RecoveryDialog, swallowEscape } from "./RecoveryDialog";

export function BootstrapGate() {
  const phase = useBootstrapStore((s) => s.phase);
  const [pending, setPending] = useState<SerializedProject | null>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (useGraphStore.getState().nodes.length !== 0) {
      useBootstrapStore.getState().setPhase("done");
      startAutoSave();
      return;
    }
    let cancelled = false;
    const run = async () => {
      const hash = typeof location !== "undefined" ? location.hash : "";
      if (hash.includes("share=")) {
        try {
          const mod = await import("../state/shareUrl");
          const decoded = await mod.decodeShareHash(hash);
          if (decoded && !cancelled) {
            useGraphStore
              .getState()
              .setGraph(decoded.graph, decoded.positions, decoded.parents);
            hydrateGraphAssets(decoded.graph.nodes);
            useHistoryStore.getState().clear();
            // Share takes precedence over recovery — drop any stale autosave.
            await clearSession();
            startAutoSave();
            useBootstrapStore.getState().setPhase("done");
            return;
          }
        } catch (e) {
          log.warn("app", "share hash decode failed", normalizeError(e));
        }
      }
      const saved = await loadSession();
      if (cancelled) return;
      if (
        saved &&
        Array.isArray(saved.graph?.nodes) &&
        saved.graph.nodes.length > 0
      ) {
        setPending(saved);
        useBootstrapStore.getState().setPhase("prompt");
        return;
      }
      useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
      useHistoryStore.getState().clear();
      startAutoSave();
      useBootstrapStore.getState().setPhase("done");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-focus the primary action when the recovery dialog opens, and capture
  // ESC so it doesn't reach other global listeners while the modal is up.
  useEffect(() => {
    if (phase !== "prompt") return;
    restoreButtonRef.current?.focus();
    window.addEventListener("keydown", swallowEscape, true);
    return () => window.removeEventListener("keydown", swallowEscape, true);
  }, [phase]);

  if (phase !== "prompt" || !pending) return null;

  const restore = () => {
    try {
      const restored = deserializeProject(pending);
      useGraphStore
        .getState()
        .setGraph(restored.graph, restored.positions, restored.parents);
      hydrateGraphAssets(restored.graph.nodes);
      useHistoryStore.getState().clear();
    } catch (e) {
      log.warn(
        "app",
        "session restore failed, falling back to demo",
        normalizeError(e),
      );
      useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
      useHistoryStore.getState().clear();
      void clearSession();
    }
    startAutoSave();
    useBootstrapStore.getState().setPhase("done");
  };

  const discard = () => {
    void clearSession();
    useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
    useHistoryStore.getState().clear();
    startAutoSave();
    useBootstrapStore.getState().setPhase("done");
  };

  const savedAt = pending.exportedAt
    ? new Date(pending.exportedAt).toLocaleString()
    : "unknown time";
  const nodeCount = pending.graph?.nodes?.length ?? 0;

  return (
    <RecoveryDialog
      savedAt={savedAt}
      nodeCount={nodeCount}
      onRestore={restore}
      onDiscard={discard}
      restoreButtonRef={restoreButtonRef}
    />
  );
}

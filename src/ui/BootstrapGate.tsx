import { useEffect, useRef, useState } from "react";
import { hydrateGraphAssets } from "../state/assetActions";
import { clearSession, loadSession, startAutoSave } from "../state/autoSave";
import { useBootstrapStore } from "../state/bootstrapStore";
import { createDemoGraph, DEMO_LAYOUT, DEMO_PARENTS } from "../state/demoGraph";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import {
  deserializeProject,
  type SerializedProject,
} from "../state/serialization";
import { toast } from "../state/toastStore";
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
          // `decodeShareHash` swallows its own parse failures and returns
          // null, so before T0-3 this catch had no realistic trigger. Now
          // that `shareUrl` is a separately-fetched chunk, the `await
          // import()` above can reject on a network hiccup or a stale cached
          // index.html mid-deploy — and the user, who followed a share link,
          // would silently land on the demo graph or a recovery prompt with
          // no indication their link was ever read. `<Toasts />` is mounted
          // unconditionally in App.tsx, so it renders during bootstrap.
          toast.error(
            "공유 링크를 불러오지 못했습니다 — 새로고침 후 다시 시도해 주세요.",
          );
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
      useGraphStore
        .getState()
        .setGraph(createDemoGraph(), DEMO_LAYOUT, DEMO_PARENTS);
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
      useGraphStore
        .getState()
        .setGraph(createDemoGraph(), DEMO_LAYOUT, DEMO_PARENTS);
      useHistoryStore.getState().clear();
      void clearSession();
    }
    startAutoSave();
    useBootstrapStore.getState().setPhase("done");
  };

  const discard = () => {
    void clearSession();
    useGraphStore
      .getState()
      .setGraph(createDemoGraph(), DEMO_LAYOUT, DEMO_PARENTS);
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

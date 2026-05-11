import { useEffect, useState } from "react";
import { clearSession, loadSession, startAutoSave } from "../state/autoSave";
import { createDemoGraph, DEMO_LAYOUT } from "../state/demoGraph";
import { useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import {
  deserializeProject,
  type SerializedProject,
} from "../state/serialization";

type Phase = "init" | "prompt" | "done";

export function BootstrapGate() {
  const [phase, setPhase] = useState<Phase>("init");
  const [pending, setPending] = useState<SerializedProject | null>(null);

  useEffect(() => {
    if (useGraphStore.getState().nodes.length !== 0) {
      setPhase("done");
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
            useGraphStore.getState().setGraph(decoded.graph, decoded.positions);
            useHistoryStore.getState().clear();
            // Share takes precedence over recovery — drop any stale autosave.
            await clearSession();
            startAutoSave();
            setPhase("done");
            return;
          }
        } catch {
          /* fall through */
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
        setPhase("prompt");
        return;
      }
      useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
      useHistoryStore.getState().clear();
      startAutoSave();
      setPhase("done");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase !== "prompt" || !pending) return null;

  const restore = () => {
    try {
      const restored = deserializeProject(pending);
      useGraphStore.getState().setGraph(restored.graph, restored.positions);
      useHistoryStore.getState().clear();
    } catch {
      useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
      useHistoryStore.getState().clear();
      void clearSession();
    }
    startAutoSave();
    setPhase("done");
  };

  const discard = () => {
    void clearSession();
    useGraphStore.getState().setGraph(createDemoGraph(), DEMO_LAYOUT);
    useHistoryStore.getState().clear();
    startAutoSave();
    setPhase("done");
  };

  const savedAt = pending.exportedAt
    ? new Date(pending.exportedAt).toLocaleString()
    : "unknown time";
  const nodeCount = pending.graph?.nodes?.length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="recovery-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#1e1e1e",
          color: "#ddd",
          border: "1px solid #333",
          borderRadius: 8,
          padding: "20px 22px",
          maxWidth: 380,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          이전 작업을 복구할까요?
        </div>
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>
          저장된 자동 백업이 있습니다 · 노드 {nodeCount}개 · {savedAt}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            data-testid="recovery-discard"
            onClick={discard}
            style={{
              background: "transparent",
              color: "#bbb",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            새로 시작
          </button>
          <button
            data-testid="recovery-restore"
            onClick={restore}
            style={{
              background: "#0e639c",
              color: "#fff",
              border: "1px solid #1177bb",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            복구
          </button>
        </div>
      </div>
    </div>
  );
}

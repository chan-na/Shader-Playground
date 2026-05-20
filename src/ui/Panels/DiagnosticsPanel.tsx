import { useEffect, useState } from "react";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { toast } from "../../state/toastStore";
import {
  clearLogBuffer,
  exportLogText,
  getLogBuffer,
  type LogCategory,
  type LogEntry,
  type LogLevel,
  log,
  normalizeError,
  subscribeLog,
} from "../../utils/log";
import { buildDiagnosticsReport } from "./diagnosticsReport";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const CATEGORIES: LogCategory[] = [
  "gl",
  "render",
  "graph",
  "assets",
  "external",
  "autosave",
  "app",
];

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "#7a7a7a",
  info: "#7aa2f7",
  warn: "#e0af68",
  error: "#ff6b6b",
};

async function copyDiagnostics(): Promise<void> {
  const renderer = useRendererStore.getState();
  const graph = useGraphStore.getState();
  const report = buildDiagnosticsReport({
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio || 1,
    },
    glInfo: renderer.glInfo,
    stats: {
      fps: renderer.stats.fps,
      drawCalls: renderer.stats.drawCalls,
      renderTick: renderer.stats.renderTick,
      errorCount: renderer.stats.errors.length,
    },
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    logText: exportLogText(),
  });
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(report);
    toast.success("진단 정보가 클립보드에 복사되었습니다");
  } catch (e) {
    log.warn("app", "diagnostics clipboard write failed", normalizeError(e));
    toast.warning("클립보드 복사 실패 — 콘솔 로그를 확인하세요");
  }
}

export function DiagnosticsPanel() {
  const setOpen = useDebugUiStore((s) => s.setOpen);
  const levelFilter = useDebugUiStore((s) => s.levelFilter);
  const categoryFilter = useDebugUiStore((s) => s.categoryFilter);
  const setLevelFilter = useDebugUiStore((s) => s.setLevelFilter);
  const setCategoryFilter = useDebugUiStore((s) => s.setCategoryFilter);

  const [entries, setEntries] = useState<readonly LogEntry[]>(() => [
    ...getLogBuffer(),
  ]);

  useEffect(() => {
    setEntries([...getLogBuffer()]);
    return subscribeLog(() => setEntries([...getLogBuffer()]));
  }, []);

  const filtered = entries.filter((e) => {
    if (
      levelFilter !== "all" &&
      LEVEL_ORDER[e.level] < LEVEL_ORDER[levelFilter]
    )
      return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div
      data-testid="diagnostics-panel"
      style={{
        position: "fixed",
        right: 12,
        bottom: 34,
        width: 460,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        background: "#161616",
        border: "1px solid #303030",
        borderRadius: 6,
        boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
        color: "#ccc",
        fontSize: 11,
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <strong style={{ flex: 1 }}>Diagnostics</strong>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
          data-testid="diagnostics-level-filter"
          aria-label="level filter"
        >
          <option value="all">all levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}+
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as typeof categoryFilter)
          }
          data-testid="diagnostics-category-filter"
          aria-label="category filter"
        >
          <option value="all">all</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-small"
          onClick={copyDiagnostics}
          data-testid="diagnostics-copy"
        >
          Copy
        </button>
        <button
          type="button"
          className="btn-small"
          onClick={() => {
            clearLogBuffer();
            setEntries([]);
          }}
          data-testid="diagnostics-clear"
        >
          Clear
        </button>
        <button
          type="button"
          className="btn-small"
          onClick={() => setOpen(false)}
          data-testid="diagnostics-close"
          aria-label="close diagnostics"
        >
          ✕
        </button>
      </div>
      <div
        data-testid="diagnostics-log-list"
        style={{
          overflowY: "auto",
          padding: "4px 8px",
          fontFamily: "monospace",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ color: "#666", padding: "8px 0" }}>
            표시할 로그가 없습니다
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.seq}
              style={{ padding: "1px 0", whiteSpace: "pre-wrap" }}
            >
              <span style={{ color: LEVEL_COLOR[e.level] }}>
                {e.level.toUpperCase()}
              </span>{" "}
              <span style={{ color: "#888" }}>{e.category}</span>: {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

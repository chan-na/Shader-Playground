import { useEffect, useState } from "react";
import { useDebugUiStore } from "../../state/debugUiStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { toast } from "../../state/toastStore";
import { tokens, withAlpha } from "../../theme";
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
import { diagnosticsMetricValues, relativeLogTime } from "./diagnosticsTab";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// dc L402 표시 순서 (design/Side Panel.dc.html diagFilterDefs) — this array
// only drives the <option> list below; LEVEL_ORDER's cumulative filter
// semantics are unaffected by display order.
const LEVELS: LogLevel[] = ["info", "warn", "error", "debug"];

// [R13/Q9] 누적 의미 오독 방지 — 라벨 정본은 design/Side Panel.dc.html L402
// (All/Info+/Warn+/Error+/Debug+). 라벨·표시 순서만 dc를 따르고, option의
// value와 LEVEL_ORDER 필터 로직(누적)은 불변.
const LEVEL_OPTION_LABEL: Record<LogLevel, string> = {
  info: "Info+",
  warn: "Warn+",
  error: "Error+",
  debug: "Debug+",
};
const CATEGORIES: LogCategory[] = [
  "gl",
  "render",
  "graph",
  "assets",
  "external",
  "autosave",
  "app",
];

/**
 * Level tag colors (design/Side Panel.dc.html L391-395, diagLog hex/bg/bd).
 * [A-5] The dc pixel values are canonical where they conflict with the README
 * §E D1 rule ("level color = semantic + text.muted") — v1.2 resolved the one
 * README-vs-dc contradiction in favor of the dc and restated the rule as:
 * INFO = accent.hover · WARN = warning · ERROR = error · DEBUG = text.secondary.
 * So INFO/DEBUG intentionally do NOT use semantic.info/text.muted here.
 */
const LEVEL_STYLE: Record<
  LogLevel,
  { color: string; background: string; borderColor: string }
> = {
  error: {
    color: "var(--error)",
    background: withAlpha(tokens.semantic.error, 0.1),
    borderColor: withAlpha(tokens.semantic.error, 0.35),
  },
  warn: {
    color: "var(--warning)",
    background: withAlpha(tokens.semantic.warning, 0.1),
    borderColor: withAlpha(tokens.semantic.warning, 0.3),
  },
  info: {
    // dc fg (L391) = accent.hover, canonical over the semantic.info rule [A-5].
    color: "var(--accent-hover)",
    background: withAlpha(tokens.semantic.info, 0.1),
    // dc bd (L391) matches tokens.accent.muted exactly.
    borderColor: tokens.accent.muted,
  },
  debug: {
    // dc fg (L395) = text.secondary, canonical over the text.muted rule [A-5].
    color: "var(--text-secondary)",
    // dc bg (L395, #0e1013) has no matching token — surface.app 근사 승인 [B-8].
    background: "var(--surface-app)",
    borderColor: "var(--border-default)",
  },
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

export function DiagnosticsPanel({
  variant = "full",
}: {
  variant?: "full" | "overlay";
}) {
  const setOpen = useDebugUiStore((s) => s.setOpen);
  const levelFilter = useDebugUiStore((s) => s.levelFilter);
  const categoryFilter = useDebugUiStore((s) => s.categoryFilter);
  const setLevelFilter = useDebugUiStore((s) => s.setLevelFilter);
  const setCategoryFilter = useDebugUiStore((s) => s.setCategoryFilter);

  const glInfo = useRendererStore((s) => s.glInfo);
  const stats = useRendererStore((s) => s.stats);
  const nodes = useGraphStore((s) => s.nodes);
  const byNode = useDiagnosticsStore((s) => s.byNode);

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

  const mv = diagnosticsMetricValues({
    glInfo,
    fps: stats.fps,
    drawCalls: stats.drawCalls,
    nodes,
    byNode,
  });
  // design/Side Panel.dc.html L221-225 (diagStats): 4 metric cards, 2×2 grid.
  const metrics: Array<{ k: string; v: string; color: string }> = [
    {
      k: "GPU",
      v: mv.gpu,
      color: "var(--text-bright-body)",
    },
    {
      k: "Frame",
      // dc L386의 값 색 #6fe3b8은 대응 토큰이 없어 semantic.success(#34d399)로
      // 근사 — 근사 5건 일괄 승인 [B-8]. (v1.1에서 이 건만 사유 주석이 누락돼
      // 있던 것을 보완.)
      v: mv.frame,
      color: "var(--success)",
    },
    {
      k: "Draw calls",
      v: mv.draws,
      color: "var(--text-primary)",
    },
    {
      // "Programs: N linked" → "Shaders: N compiled" [A-6] — 실제 GL 링크
      // 카운터가 없어 값이 프록시이므로 라벨을 측정 대상에 맞췄다.
      k: "Shaders",
      v: mv.shaders,
      color: "var(--text-primary)",
    },
  ];

  return (
    <div
      className="panel-body"
      data-testid="diagnostics-panel"
      style={{
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        fontSize: 11,
      }}
    >
      {/* T3(§v1.6): 172px 오버레이 호스팅 시 2×2 카드 억제 — 전체 카드는
          Side Panel Diagnostics 탭 전용(구현엔 아직 해당 호스트 없음,
          followup 참조). */}
      {variant === "full" ? (
        <div
          style={{ padding: "12px 14px" }}
          data-testid="diagnostics-metric-cards"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {metrics.map((m) => (
              <div
                key={m.k}
                style={{
                  background: "var(--surface-card)",
                  border: "1px solid var(--border-default)",
                  // dc L222 radius 8 — no exact token; approximated with
                  // radius.button (7), same D11 precedent as the multi-select
                  // chip radius. Followup logged.
                  borderRadius: tokens.radius.button,
                  padding: "9px 11px",
                  // Grid items default to min-width:auto, so a long nowrap
                  // value (e.g. a real GPU renderer string) forces this track
                  // to its intrinsic width and collapses the 2x2 layout.
                  // minWidth:0 lets the item shrink to the grid track so the
                  // value div's existing nowrap+ellipsis (below) can clip it.
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 5,
                  }}
                >
                  {m.k}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: m.color,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Runtime log
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
          data-testid="diagnostics-level-filter"
          aria-label="level filter"
        >
          <option value="all">All</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_OPTION_LABEL[l]}
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
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "0 14px 12px",
        }}
      >
        {filtered.length === 0 ? (
          <div className="inspector-empty">표시할 로그가 없습니다</div>
        ) : (
          filtered.map((e) => {
            const baseTs = entries[0]?.ts ?? e.ts;
            const levelStyle = LEVEL_STYLE[e.level];
            return (
              <div
                key={e.seq}
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-start",
                  padding: "8px 10px",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: tokens.radius.button,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8.5,
                    fontWeight: 600,
                    color: levelStyle.color,
                    background: levelStyle.background,
                    // dc L232 radius 4 — no exact token; approximated with
                    // iconBox (5), same D11 precedent. Followup logged.
                    borderRadius: tokens.radius.iconBox,
                    border: `1px solid ${levelStyle.borderColor}`,
                    padding: "1px 5px",
                    minWidth: 44,
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {e.level.toUpperCase()}
                </span>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--text-bright-body)",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {/* 카테고리 접두(gl/shader/mem)가 v1.2에서 dc에 정식 추가됐다
                      — text.muted 색도 dc와 일치 [C-9]. */}
                  <span style={{ color: "var(--text-muted)" }}>
                    {e.category}
                  </span>
                  : {e.message}
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    // dc time column fg (L391-395, #565e68)에 대응 토큰이 없어
                    // text.muted로 근사 — 근사 5건 일괄 승인 [B-8].
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {relativeLogTime(e.ts, baseTs)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

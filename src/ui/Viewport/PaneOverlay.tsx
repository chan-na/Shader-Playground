import { splitLayout } from "../../core/graph/execute";
import { displayNodeName, NODE_META } from "../../core/nodes/registry";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { tokens, withAlpha } from "../../theme";
import { bottomRowFlags, dividerCssRects, paneCssRects } from "./paneLayout";

/**
 * DOM overlay for the Output pane composite grid: 1px divider seams +
 * per-pane label / GPU-ms badge / resolution caption (design/Viewport.dc.html
 * L65-87). Geometry is derived from `paneLayout.ts`, which shares the exact
 * `splitLayout` split the GL composite pass draws into, so this layer can
 * never drift from the WebGL canvas beneath it.
 *
 * Entirely `pointer-events: none` (see `.vp-overlay` in index.css) so camera
 * orbit drag and the `u_mouse` pointer listeners on the canvas underneath
 * keep working through it.
 */
export function PaneOverlay() {
  const panes = useRendererStore((s) => s.panes);
  const canvasSize = useRendererStore((s) => s.canvasSize);
  const byNode = useGpuTimerStore((s) => s.byNode);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);
  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const nodes = useGraphStore((s) => s.nodes);

  if (panes.length === 0) return null;

  const rects = paneCssRects(panes.length);
  const cells = splitLayout(panes.length, canvasSize.width, canvasSize.height);
  const dividers = dividerCssRects(panes.length);
  const bottoms = bottomRowFlags(panes.length);

  return (
    <div className="vp-overlay">
      {panes.map((pane, i) => {
        const rect = rects[i];
        const cell = cells[i];
        if (!rect || !cell) return null;
        const ms = byNode[pane.sourceNodeId];
        const outputNode = nodes.find((n) => n.id === pane.outputNodeId);
        const display = outputNode ? displayNodeName(outputNode) : null;
        // [D15] dc L247 "Output · main" — 사용자 지정 이름만 접미로 노출한다.
        // displayNodeName의 폴백(NODE_META.output.label "Output")이 그대로
        // 오면 접미를 생략해 "Output · Output" 중복을 피한다 (미지정 노드
        // 폴백 표기: "Output" 단독 — A/B/C/D 칩이 이미 pane을 구분한다.
        // 잠정 결정, followup 참조).
        const paneName =
          display && display !== NODE_META.output.label
            ? `Output · ${display}`
            : "Output";
        return (
          <div
            key={pane.outputNodeId}
            className={`vp-pane${bottoms[i] ? " vp-pane--bottom" : ""}`}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          >
            <div className="vp-pane-label" data-testid={`vp-pane-label-${i}`}>
              <span
                className="vp-pane-chip"
                style={{
                  background: withAlpha(tokens.surface.app, 0.7),
                  border: `1px solid ${withAlpha("#ffffff", 0.12)}`,
                  borderRadius: "var(--radius-chip)",
                  backdropFilter: "blur(4px)",
                  color: "var(--text-primary)",
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span
                className="vp-pane-name"
                style={{
                  color: withAlpha(tokens.text.primary, 0.82),
                  textShadow: "var(--shadow-on-canvas-text)",
                }}
              >
                {paneName}
              </span>
            </div>
            {gpuEnabled && gpuSupported && ms !== undefined && (
              <span
                className="vp-pane-ms"
                data-testid={`vp-pane-ms-${i}`}
                style={{
                  color: "var(--success)",
                  background: withAlpha(tokens.surface.app, 0.72),
                  border: `1px solid ${withAlpha(tokens.semantic.success, 0.35)}`,
                  borderRadius: "var(--radius-chip)",
                  backdropFilter: "blur(4px)",
                }}
              >
                {`${ms.toFixed(2)} ms`}
              </span>
            )}
            <span
              className="vp-pane-res"
              data-testid={`vp-pane-res-${i}`}
              style={{
                color: withAlpha(tokens.text.secondary, 0.85),
                textShadow: "var(--shadow-on-canvas-text)",
              }}
            >
              {`${cell.w} × ${cell.h}`}
            </span>
          </div>
        );
      })}
      {dividers.map((d) => (
        <div
          key={`${d.left}|${d.top}|${d.width}|${d.height}`}
          className="vp-divider"
          style={{ left: d.left, top: d.top, width: d.width, height: d.height }}
        />
      ))}
    </div>
  );
}

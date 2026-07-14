import { Panel, useReactFlow, useViewport } from "@xyflow/react";
import { tokens, withAlpha } from "../../theme";
import { MOTION_MAX_MS, MOTION_MID_MS } from "../motion";

/** Zoom-in/out transitions get the motion floor (90-150ms range); fit gets a
 * touch longer since it also pans, matching the auto-fit call in index.tsx.
 * Values come from src/ui/motion.ts (tokens.motion-derived). */
const ZOOM_STEP_DURATION_MS = MOTION_MID_MS;
const FIT_VIEW_DURATION_MS = MOTION_MAX_MS;
const FIT_VIEW_PADDING = 0.15;

/** Round a React Flow zoom factor (e.g. 0.8234) to a percent label ("82%"). */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * Custom bottom-left zoom cluster replacing React Flow's built-in
 * `<Controls>` (design/Node Editor.dc.html L296-302): − / current-zoom% / +
 * / a divider / fit. Must be rendered as a child of `<ReactFlow>` so
 * useViewport()/useReactFlow() resolve against the surrounding provider.
 */
export function ZoomControls() {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left">
      <div
        className="sp-zoom-controls"
        data-testid="zoom-controls"
        style={{
          display: "flex",
          gap: 3,
          background: withAlpha(tokens.surface.panel, 0.9),
          border: "1px solid var(--border-default)",
          borderRadius: tokens.radius.overlay,
          padding: 3,
          backdropFilter: "blur(4px)",
        }}
      >
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => void zoomOut({ duration: ZOOM_STEP_DURATION_MS })}
          style={{
            width: 26,
            height: 26,
            background: "transparent",
            border: "none",
            color: "var(--text-bright-body)",
            borderRadius: tokens.radius.iconBox,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          −
        </button>
        <div
          style={{
            minWidth: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-secondary)",
          }}
        >
          {formatZoom(zoom)}
        </div>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => void zoomIn({ duration: ZOOM_STEP_DURATION_MS })}
          style={{
            width: 26,
            height: 26,
            background: "transparent",
            border: "none",
            color: "var(--text-bright-body)",
            borderRadius: tokens.radius.iconBox,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          +
        </button>
        <div
          style={{
            width: 1,
            background: "var(--border-default)",
            margin: "3px 2px",
          }}
        />
        <button
          type="button"
          aria-label="Fit view"
          onClick={() =>
            void fitView({
              padding: FIT_VIEW_PADDING,
              duration: FIT_VIEW_DURATION_MS,
            })
          }
          style={{
            padding: "0 9px",
            height: 26,
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            borderRadius: tokens.radius.iconBox,
            cursor: "pointer",
            fontSize: 10.5,
            fontFamily: "var(--font-mono)",
          }}
        >
          fit
        </button>
      </div>
    </Panel>
  );
}

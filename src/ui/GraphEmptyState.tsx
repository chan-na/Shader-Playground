import type { CSSProperties } from "react";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import { withAlpha } from "../theme";

/**
 * Empty-graph onboarding (design/System States.dc.html L104-119,
 * "graph: EMPTY" state, M7-U2). NodeEditor mounts this in the same
 * `.panel-body` slot as GraphSkeleton/WelcomeOverlay/the
 * selection-count-badge, once WelcomeOverlay's "Start blank" has been
 * clicked (see WelcomeOverlay.tsx's `dismissed` state) — i.e. exactly the
 * moment the user asked to keep the canvas empty instead of loading a
 * starter graph.
 *
 * The root is `pointer-events: none` (opposite of WelcomeOverlay's `auto`):
 * unlike Welcome's full starter-card grid, this state has nothing to
 * scroll, so letting clicks/wheel/drag fall through to the ReactFlow pane
 * behind it keeps canvas pan/zoom working right up to the edge of the
 * centered content column. Only `.graph-empty-content` re-enables pointer
 * events, for its two buttons.
 *
 * dc's icon halo loops via `ssBreathe` (scale/opacity keyframe) — not
 * reproduced here. CLAUDE.md's "상시 애니메이션 금지" policy (same
 * reasoning as WelcomeOverlay's `welcome-brand-halo`) replaces it with a
 * single static radial glow.
 */

interface GraphEmptyStateProps {
  onLoadPreset: () => void;
}

/** "+ Add node" button's solid-white label (dc L115: `color:#fff`) — same
 * white-channel exception as WelcomeOverlay's CHIP_STYLE/CREATE_SHADOW
 * (no var(--*) expresses literal white), kept inline via withAlpha so the
 * raw hex stays confined to this one documented call. */
const ADD_BUTTON_TEXT_STYLE: CSSProperties = {
  color: withAlpha("#ffffff", 1),
};

/** kbd chip background (dc L115: `rgba(255,255,255,0.18)`) — WelcomeOverlay
 * KBD_STYLE's pattern reused for the same reason as above. */
const KBD_STYLE: CSSProperties = {
  background: withAlpha("#ffffff", 0.18),
};

export function GraphEmptyState({ onLoadPreset }: GraphEmptyStateProps) {
  return (
    <div className="graph-empty-state" data-testid="graph-empty-state">
      <div className="graph-empty-glow" aria-hidden="true" />
      <div className="graph-empty-content">
        <div className="graph-empty-icon-wrap" aria-hidden="true">
          <div className="graph-empty-icon-halo" />
          <div className="graph-empty-icon">◆</div>
        </div>
        <div className="graph-empty-title">Your graph is empty</div>
        <div className="graph-empty-body">
          Add a source, wire it into a shader, and connect an output. Press{" "}
          <span className="graph-empty-body-accent">⌘K</span> to add any node.
        </div>
        <div className="graph-empty-actions">
          <button
            type="button"
            data-testid="graph-empty-add-node"
            className="graph-empty-add"
            style={ADD_BUTTON_TEXT_STYLE}
            onClick={() => useCommandPaletteStore.getState().setOpen(true)}
          >
            + Add node
            <span
              className="graph-empty-add-kbd"
              style={KBD_STYLE}
              aria-hidden="true"
            >
              ⌘K
            </span>
          </button>
          <button
            type="button"
            data-testid="graph-empty-load-preset"
            className="graph-empty-load"
            onClick={onLoadPreset}
          >
            Load a preset
          </button>
        </div>
      </div>
    </div>
  );
}

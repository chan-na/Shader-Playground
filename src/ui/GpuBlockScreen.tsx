import type { CSSProperties } from "react";
import { useRendererStore } from "../state/rendererStore";
import { tokens, withAlpha } from "../theme";

const GPU_BLOCK_TITLE_ID = "gpu-block-title";

/** Scrim tint — needs alpha math the CSS `.modal-scrim` class can't express
 * (see index.css's comment on that class). */
const SCRIM_STYLE: CSSProperties = {
  background: withAlpha(tokens.surface.appDarker, 0.72),
  zIndex: 9990,
};

/** Icon halo bg/border need alpha derivation; the glyph color itself doesn't
 * (plain `var(--error)` in the `.gpu-block-icon` CSS class covers it). */
const ICON_STYLE: CSSProperties = {
  background: withAlpha(tokens.semantic.error, 0.13),
  border: `1px solid ${withAlpha(tokens.semantic.error, 0.4)}`,
};

/** Tip chip background needs alpha derivation (border/color don't — see the
 * `.gpu-block-tip-chip` CSS class). */
const CHIP_STYLE: CSSProperties = {
  background: withAlpha(tokens.accent.default, 0.14),
};

/** Retry button's solid-white label + accent-alpha glow — same documented
 * white-channel exception as GraphEmptyState's ADD_BUTTON_TEXT_STYLE (no
 * var(--*) expresses literal white), plus the shadow's alpha math. */
const RETRY_BUTTON_STYLE: CSSProperties = {
  color: withAlpha("#ffffff", 1),
  boxShadow: `0 4px 14px ${withAlpha(tokens.accent.default, 0.3)}`,
};

const GPU_TIPS: ReadonlyArray<{ n: string; text: string }> = [
  {
    n: "1",
    text: "Enable hardware acceleration in your browser settings, then reload.",
  },
  {
    n: "2",
    text: "Update your graphics drivers — WebGL2 needs a modern GPU.",
  },
  { n: "3", text: "Try a current Chrome, Edge or Firefox build." },
];

/**
 * Full-app blocking screen for a missing WebGL2 context (design/System
 * States.dc.html gpu-unsupported, L389-424, M7-U5). Renders on top of the
 * entire shell whenever rendererStore.contextUnavailable is true — set by
 * Viewport's GL boot effect when `createGLContext` throws, cleared either by
 * that same effect succeeding or by this screen's own Retry button
 * (`retryGlContext()`, which bumps `glRetryTick` to force the boot effect to
 * re-run).
 *
 * SwiftShader (the E2E test renderer) always provides a real WebGL2 context,
 * so `contextUnavailable` never flips true in CI — this screen is inert
 * there and doesn't affect existing E2E specs.
 */
export function GpuBlockScreen() {
  const contextUnavailable = useRendererStore((s) => s.contextUnavailable);
  const glInfo = useRendererStore((s) => s.glInfo);

  if (!contextUnavailable) return null;

  return (
    <div
      className="modal-scrim"
      data-testid="gpu-block-screen"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={GPU_BLOCK_TITLE_ID}
      style={SCRIM_STYLE}
    >
      <div className="modal-card gpu-block-card">
        <div className="gpu-block-header">
          <div className="gpu-block-header-row">
            <div
              className="gpu-block-icon"
              style={ICON_STYLE}
              aria-hidden="true"
            >
              ⊘
            </div>
            <div>
              <div id={GPU_BLOCK_TITLE_ID} className="gpu-block-title">
                WebGL2 is not available
              </div>
              <div className="gpu-block-subtitle">
                ShaderPlayground needs a WebGL2 rendering context to run.
              </div>
            </div>
          </div>
          <div className="gpu-block-diagnostics">
            <div className="gpu-block-diag-row">
              <span className="gpu-block-diag-label">context</span>
              <span className="gpu-block-diag-error">null</span>
            </div>
            <div className="gpu-block-diag-row">
              <span className="gpu-block-diag-label">renderer</span>
              <span className="gpu-block-diag-muted">
                {glInfo?.renderer ?? "unavailable"}
              </span>
            </div>
            <div className="gpu-block-diag-row">
              <span className="gpu-block-diag-label">webgl2</span>
              <span className="gpu-block-diag-error">unsupported</span>
            </div>
          </div>
        </div>
        <div className="gpu-block-body">
          <div className="gpu-block-label">Try this</div>
          <div className="gpu-block-tips">
            {GPU_TIPS.map((tip) => (
              <div className="gpu-block-tip-row" key={tip.n}>
                <span
                  className="gpu-block-tip-chip"
                  style={CHIP_STYLE}
                  aria-hidden="true"
                >
                  {tip.n}
                </span>
                <span className="gpu-block-tip-text">{tip.text}</span>
              </div>
            ))}
          </div>
          <div className="gpu-block-footer">
            <button
              type="button"
              data-testid="gpu-block-retry"
              className="gpu-block-retry"
              style={RETRY_BUTTON_STYLE}
              onClick={() => useRendererStore.getState().retryGlContext()}
            >
              Retry detection
            </button>
            {/* dc's href="#" is a dead link — points at the real WebGL2
                feature-support page instead. */}
            <a
              className="gpu-block-link"
              href="https://get.webgl.org/webgl2/"
              target="_blank"
              rel="noreferrer"
            >
              Troubleshooting ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

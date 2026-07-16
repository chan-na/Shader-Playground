import type { CSSProperties } from "react";
import { tokens } from "../../theme";

export interface MultiSelectBannerProps {
  /** Size of the current selection (>=2 — index.tsx only mounts this when
   * multi-select is active). */
  count: number;
  /** One chip per selected shader/compute node, in selection order. `label`
   * is the display name (`displayNodeName()`); `id` is kept for key/testid
   * only — see index.tsx's chip-building comment for the stale-id case. */
  chips: Array<{ id: string; label: string; hasError: boolean }>;
}

/**
 * Code Editor.dc.html L56-72 — multi-select state. Swapped in for the
 * CodeMirror container (which stays mounted, just `display: none`) whenever
 * 2+ nodes are selected, since editing GLSL only makes sense for one node
 * at a time. Presentation-only — no actions (Recompile all / Group nodes
 * from the dc are net-new features, out of scope here).
 */

const ROOT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
};

const ICON_BOX_STYLE: CSSProperties = {
  width: 56,
  height: 56,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: tokens.radius.panel,
  background: tokens.surface.panel,
  border: `1px solid ${tokens.border.default}`,
  fontSize: 22,
  color: tokens.accent.hover,
};

const TITLE_STYLE: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: tokens.text.brightBody,
  marginBottom: 5,
  textAlign: "center",
};

const SUBTITLE_STYLE: CSSProperties = {
  fontSize: 12.5,
  color: tokens.text.muted,
  textAlign: "center",
};

const CHIP_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: 8,
};

const CHIP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 11px",
  background: tokens.surface.panel,
  border: `1px solid ${tokens.border.default}`,
  borderRadius: tokens.radius.button,
  fontFamily: tokens.font.mono,
  fontSize: 11,
  color: tokens.text.brightBody,
};

const CHIP_DOT_STYLE: CSSProperties = {
  width: 9,
  height: 9,
  flexShrink: 0,
  borderRadius: 2,
  background: tokens.accent.default,
};

const CHIP_ERROR_DOT_STYLE: CSSProperties = {
  width: 6,
  height: 6,
  flexShrink: 0,
  borderRadius: "50%",
  background: tokens.semantic.error,
};

export function MultiSelectBanner({ count, chips }: MultiSelectBannerProps) {
  return (
    <div style={ROOT_STYLE} data-testid="code-multi-select-banner">
      <div style={ICON_BOX_STYLE} aria-hidden="true">
        ⧉
      </div>
      <div>
        <div style={TITLE_STYLE}>{count} nodes selected</div>
        <div style={SUBTITLE_STYLE}>Select a single node to edit its GLSL.</div>
      </div>
      <div style={CHIP_ROW_STYLE}>
        {chips.map((chip) => (
          <span key={chip.id} style={CHIP_STYLE}>
            <span style={CHIP_DOT_STYLE} aria-hidden="true" />
            {chip.label}
            {chip.hasError && (
              <span
                style={CHIP_ERROR_DOT_STYLE}
                data-testid="code-multi-select-chip-error"
                role="img"
                aria-label="has errors"
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

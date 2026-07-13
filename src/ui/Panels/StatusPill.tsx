import type { CSSProperties, ReactNode } from "react";
import { tokens, withAlpha } from "../../theme";

type StatusPillTone = "success" | "error" | "muted";

export interface StatusPillProps {
  tone: StatusPillTone;
  children: ReactNode;
}

const baseStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "8px 10px",
  borderRadius: 7,
  fontSize: 11,
};

const dotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
};

/**
 * Inline live-status readout (design/Side Panel.dc.html L141's "Stream
 * active · 1280×720 @ 30fps" pill) shared by the Webcam/Video/Audio
 * inspectors' status rows. `muted` has no matching mock — idle/no-asset
 * copy is presentation-only for this refactor — so it borrows the
 * Inspector's neutral card/border/muted-text triple (used e.g. by
 * InspectorNodeHeader's kind chip) instead of a semantic color.
 */
export function StatusPill({ tone, children }: StatusPillProps) {
  if (tone === "muted") {
    return (
      <div
        style={{
          ...baseStyle,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ ...dotStyle, background: "var(--text-muted)" }} />
        {children}
      </div>
    );
  }

  const semanticHex =
    tone === "success" ? tokens.semantic.success : tokens.semantic.error;
  const colorVar = tone === "success" ? "var(--success)" : "var(--error)";
  return (
    <div
      style={{
        ...baseStyle,
        background: withAlpha(semanticHex, 0.08),
        border: `1px solid ${withAlpha(semanticHex, 0.25)}`,
        color: colorVar,
      }}
    >
      <span style={{ ...dotStyle, background: colorVar }} />
      {children}
    </div>
  );
}

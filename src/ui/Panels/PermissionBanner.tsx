import type { CSSProperties } from "react";
import { tokens, withAlpha } from "../../theme";

export interface PermissionBannerProps {
  device: "camera" | "microphone";
  state: "pending" | "denied";
  onRetry: () => void;
}

/** The colored alert row shared by both states — only the semantic hue
 * (warning vs error) and its content differ. */
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: "var(--radius-overlay)",
};

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const textStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.4,
  flex: 1,
};

/**
 * Inspector warning banner for a Webcam/Audio source whose permission is
 * "pending" (awaiting the browser prompt) or "denied" (user/browser blocked
 * it) — design/System States.dc.html L344-363 (inspector panel warning row)
 * for pending, L262-267 (viewport onboarding copy's retry button + caption)
 * for the denied retry affordance. The center-viewport permission overlay
 * itself is intentionally not implemented (M7-U3 notes deviation 1) — this
 * banner is the only surfaced permission UI in the reimplementation.
 */
export function PermissionBanner({
  device,
  state,
  onRetry,
}: PermissionBannerProps) {
  const deviceLabel = device === "camera" ? "camera" : "microphone";

  if (state === "pending") {
    return (
      <div
        data-testid="permission-banner"
        data-state="pending"
        style={{
          ...rowStyle,
          background: withAlpha(tokens.semantic.warning, 0.1),
          border: `1px solid ${withAlpha(tokens.semantic.warning, 0.3)}`,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            ...dotStyle,
            background: "var(--warning)",
            boxShadow: `0 0 7px ${withAlpha(tokens.semantic.warning, 1)}`,
            // Pulses only while this pending banner is mounted — never an
            // idle/decorative loop (CLAUDE.md's motion policy), it stops the
            // moment the permission resolves and the component unmounts.
            animation: "sp-pulse 1.4s ease-in-out infinite",
          }}
        />
        <span style={{ ...textStyle, color: "var(--warning)" }}>
          {`Awaiting ${deviceLabel} permission — parameters lock until access is granted.`}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="permission-banner"
      data-state="denied"
      style={{ marginBottom: 14 }}
    >
      <div
        style={{
          ...rowStyle,
          background: withAlpha(tokens.semantic.error, 0.1),
          border: `1px solid ${withAlpha(tokens.semantic.error, 0.3)}`,
        }}
      >
        <span style={{ ...dotStyle, background: "var(--error)" }} />
        <span style={{ ...textStyle, color: "var(--error)" }}>
          {`${device === "camera" ? "Camera" : "Microphone"} access was blocked — grant it in your browser to start capture.`}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 6,
          marginTop: 10,
        }}
      >
        <button
          type="button"
          data-testid="permission-retry"
          onClick={onRetry}
          style={{
            height: 28,
            padding: "0 12px",
            background: "var(--accent-default)",
            border: "none",
            borderRadius: "var(--radius-button)",
            color: withAlpha("#ffffff", 1),
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {device === "camera" ? "Enable camera" : "Enable microphone"}
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          ↳ manage in browser site settings anytime
        </span>
      </div>
    </div>
  );
}

import type { Toast, ToastKind } from "../state/toastStore";
import { tokens, withAlpha } from "../theme";

const ICON_BY_KIND: Record<ToastKind, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

const COLOR_BY_KIND: Record<ToastKind, { bg: string; border: string }> = {
  info: {
    bg: withAlpha(tokens.semantic.info, 0.14),
    border: withAlpha(tokens.semantic.info, 0.45),
  },
  success: {
    bg: withAlpha(tokens.semantic.success, 0.14),
    border: withAlpha(tokens.semantic.success, 0.45),
  },
  warning: {
    bg: withAlpha(tokens.semantic.warning, 0.14),
    border: withAlpha(tokens.semantic.warning, 0.45),
  },
  error: {
    bg: withAlpha(tokens.semantic.error, 0.14),
    border: withAlpha(tokens.semantic.error, 0.45),
  },
};

export interface ToastRowProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function ToastRow({ toast: t, onDismiss }: ToastRowProps) {
  const c = COLOR_BY_KIND[t.kind];
  return (
    <div
      role="status"
      data-testid="toast"
      data-kind={t.kind}
      style={{
        background: c.bg,
        color: tokens.text.brightBody,
        border: `1px solid ${c.border}`,
        borderRadius: tokens.radius.chip,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: tokens.font.ui,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
      }}
    >
      <span aria-hidden="true" style={{ opacity: 0.85, lineHeight: "16px" }}>
        {ICON_BY_KIND[t.kind]}
      </span>
      <span
        style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {t.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        title="Dismiss"
        aria-label="Dismiss notification"
        style={{
          background: "transparent",
          color: tokens.text.secondary,
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 12,
          lineHeight: "16px",
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

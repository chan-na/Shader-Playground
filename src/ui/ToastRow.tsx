import type { Toast, ToastKind } from "../state/toastStore";

const ICON_BY_KIND: Record<ToastKind, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

const COLOR_BY_KIND: Record<ToastKind, { bg: string; border: string }> = {
  info: { bg: "#1e2a38", border: "#3a5a78" },
  success: { bg: "#1e3823", border: "#3a7848" },
  warning: { bg: "#3a2e1a", border: "#7a5e2a" },
  error: { bg: "#3a1a1a", border: "#7a3a3a" },
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
        color: "#ddd",
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
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
          color: "#888",
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

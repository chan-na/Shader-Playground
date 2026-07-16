// [D6] Crash fallback is INTENTIONALLY token/webfont-independent: it must
// render even when cssVars() injection or webfont loading failed. Raw hex +
// system-ui here is BY DESIGN, not a tokenization gap — see
// design/README.md §도메인 규칙, design/System States.dc.html L427-446. Only
// the Reload CTA references tokens.accent.default (JS constant, safe at
// runtime).
import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { tokens } from "../theme";
import { exportLogText, log, normalizeError } from "../utils/log";

const OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  background: "#111214",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif",
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: 430,
  textAlign: "center",
  color: "#dddddd",
};

// #f0555c matches tokens.semantic.error's value, but per [D6] this screen
// deliberately does not reference theme.ts — literal kept intentionally.
const ICON_BOX_STYLE: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  background: "#2a2a2a",
  border: "1px solid #3a3a3a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  color: "#f0555c",
  margin: "0 auto 18px",
};

const TITLE_STYLE: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "#eeeeee",
  marginBottom: 8,
};

const BODY_STYLE: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "#999999",
  marginBottom: 14,
};

const DETAIL_STYLE: CSSProperties = {
  fontFamily: "ui-monospace,Menlo,Consolas,monospace",
  fontSize: 11,
  textAlign: "left",
  color: "#8a8a8a",
  background: "#0d0d0e",
  border: "1px solid #262626",
  borderRadius: 6,
  padding: "10px 12px",
  overflow: "auto",
  margin: "0 0 18px",
  whiteSpace: "pre-wrap",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "center",
};

// Sole theme reference on this screen (README §도메인 규칙 [D6]: "액센트 버튼
// 색만 accent.default 유지"). Radius is the dc-literal 6, not
// tokens.radius.button (7) — this screen is a documented token exception.
const RELOAD_BUTTON_STYLE: CSSProperties = {
  height: 36,
  padding: "0 18px",
  background: tokens.accent.default,
  border: "none",
  borderRadius: 6,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const COPY_BUTTON_STYLE: CSSProperties = {
  height: 36,
  padding: "0 14px",
  background: "transparent",
  border: "1px solid #3a3a3a",
  borderRadius: 6,
  color: "#cccccc",
  fontSize: 13,
  cursor: "pointer",
};

const FOOTER_STYLE: CSSProperties = {
  fontSize: 11,
  color: "#666666",
  marginTop: 16,
};

/** Formats the crash detail block: first 3 lines of the error's stack when
 * present, otherwise falls back to "name: message". Module-private (not
 * exported) to keep Knip's unused-export check clean. */
function formatCrashDetail(error: Error): string {
  if (typeof error.stack === "string" && error.stack.length > 0) {
    return error.stack.split("\n").slice(0, 3).join("\n");
  }
  return `${error.name}: ${error.message}`;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 렌더 트리에서 잡히지 않은 에러를 백지 화면 대신 최소 복구 UI로 표면화한다.
 * 에러는 로거에 남겨 진단 패널/콘솔에서 추적 가능하게 한다 (Debugging-Plan P2).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error("app", "uncaught render error", {
      error: normalizeError(error),
      componentStack: info.componentStack,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleCopy = (): void => {
    void navigator.clipboard?.writeText(exportLogText());
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div role="alert" style={OVERLAY_STYLE}>
        <div data-testid="error-boundary-fallback" style={CONTENT_STYLE}>
          <div style={ICON_BOX_STYLE}>!</div>
          <div style={TITLE_STYLE}>Something went wrong</div>
          <div style={BODY_STYLE}>
            ShaderPlayground hit an unexpected error and had to stop rendering.
            Your last saved project is safe.
          </div>
          <pre style={DETAIL_STYLE}>{formatCrashDetail(this.state.error)}</pre>
          <div style={ACTIONS_STYLE}>
            <button
              type="button"
              data-testid="error-boundary-reload"
              onClick={this.handleReload}
              style={RELOAD_BUTTON_STYLE}
            >
              Reload app
            </button>
            <button
              type="button"
              data-testid="error-boundary-copy"
              onClick={this.handleCopy}
              style={COPY_BUTTON_STYLE}
            >
              Copy error report
            </button>
          </div>
          <div style={FOOTER_STYLE}>
            Fallback UI · minimal styling by design — no theme tokens or web
            fonts required
          </div>
        </div>
      </div>
    );
  }
}

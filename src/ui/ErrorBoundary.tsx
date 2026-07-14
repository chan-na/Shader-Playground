import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { tokens, withAlpha } from "../theme";
import { exportLogText, log, normalizeError } from "../utils/log";

/** Scrim tint — same alpha-derivation exception as GpuBlockScreen's
 * SCRIM_STYLE (see index.css's `.modal-scrim` comment). */
const SCRIM_STYLE: CSSProperties = {
  background: withAlpha(tokens.surface.appDarker, 0.72),
  zIndex: 9998,
};

const CARD_STYLE: CSSProperties = {
  width: 440,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  textAlign: "center",
};

const COPY_BUTTON_STYLE: CSSProperties = {
  background: "transparent",
  border: `1px solid ${tokens.border.strong}`,
  color: tokens.text.brightBody,
  borderRadius: tokens.radius.button,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

/** Reload button's solid-white label — documented white-channel exception,
 * same pattern as GraphEmptyState's ADD_BUTTON_TEXT_STYLE. */
const RELOAD_BUTTON_STYLE: CSSProperties = {
  background: tokens.accent.default,
  border: "none",
  color: withAlpha("#ffffff", 1),
  borderRadius: tokens.radius.button,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

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
      <div className="modal-scrim" role="alert" style={SCRIM_STYLE}>
        <div
          className="modal-card"
          data-testid="error-boundary-fallback"
          style={CARD_STYLE}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            문제가 발생했습니다
          </div>
          <div
            style={{
              fontSize: 12,
              color: tokens.text.secondary,
              maxWidth: 380,
            }}
          >
            예기치 못한 오류로 화면을 표시할 수 없습니다. 새로고침하거나 진단
            정보를 복사해 보고해 주세요.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="error-boundary-copy"
              onClick={this.handleCopy}
              style={COPY_BUTTON_STYLE}
            >
              진단 정보 복사
            </button>
            <button
              type="button"
              data-testid="error-boundary-reload"
              onClick={this.handleReload}
              style={RELOAD_BUTTON_STYLE}
            >
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}

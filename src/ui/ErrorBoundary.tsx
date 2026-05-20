import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportLogText, log, normalizeError } from "../utils/log";

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
      <div
        role="alert"
        data-testid="error-boundary-fallback"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#1e1e1e",
          color: "#ddd",
          fontFamily: "system-ui, sans-serif",
          zIndex: 9998,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>문제가 발생했습니다</div>
        <div style={{ fontSize: 12, color: "#aaa", maxWidth: 420 }}>
          예기치 못한 오류로 화면을 표시할 수 없습니다. 새로고침하거나 진단
          정보를 복사해 보고해 주세요.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            data-testid="error-boundary-copy"
            onClick={this.handleCopy}
            style={{
              background: "transparent",
              color: "#bbb",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            진단 정보 복사
          </button>
          <button
            type="button"
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            style={{
              background: "#0e639c",
              color: "#fff",
              border: "1px solid #1177bb",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }
}

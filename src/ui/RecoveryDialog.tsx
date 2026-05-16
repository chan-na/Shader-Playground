import type { RefObject } from "react";

const RECOVERY_TITLE_ID = "recovery-dialog-title";

/**
 * ESC 가 다른 글로벌 핸들러(CommandPalette toggle 등) 로 빠져나가지 않게
 * 모달 위에서 무력화한다. ESC 는 discard 로 동작하지 않는 것이 의도된 정책 —
 * 복구/새로 시작 두 분기 모두 결과가 영구적이라 사용자가 명시적으로 골라야 한다.
 */
export function swallowEscape(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
}

interface RecoveryDialogProps {
  savedAt: string;
  nodeCount: number;
  onRestore: () => void;
  onDiscard: () => void;
  restoreButtonRef?: RefObject<HTMLButtonElement>;
}

export function RecoveryDialog({
  savedAt,
  nodeCount,
  onRestore,
  onDiscard,
  restoreButtonRef,
}: RecoveryDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={RECOVERY_TITLE_ID}
      data-testid="recovery-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#1e1e1e",
          color: "#ddd",
          border: "1px solid #333",
          borderRadius: 8,
          padding: "20px 22px",
          maxWidth: 380,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          id={RECOVERY_TITLE_ID}
          style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
        >
          이전 작업을 복구할까요?
        </div>
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>
          저장된 자동 백업이 있습니다 · 노드 {nodeCount}개 · {savedAt}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            data-testid="recovery-discard"
            onClick={onDiscard}
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
            새로 시작
          </button>
          <button
            ref={restoreButtonRef}
            type="button"
            data-testid="recovery-restore"
            onClick={onRestore}
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
            복구
          </button>
        </div>
      </div>
    </div>
  );
}

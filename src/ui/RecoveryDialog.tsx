import type { CSSProperties, RefObject } from "react";
import { tokens, withAlpha } from "../theme";

const RECOVERY_TITLE_ID = "recovery-dialog-title";

/** Scrim tint — same alpha-derivation exception as GpuBlockScreen's
 * SCRIM_STYLE (see index.css's `.modal-scrim` comment). */
const SCRIM_STYLE: CSSProperties = {
  background: withAlpha(tokens.surface.appDarker, 0.72),
  zIndex: 9999,
};

const CARD_STYLE: CSSProperties = { padding: "22px 24px", maxWidth: 400 };

const DISCARD_BUTTON_STYLE: CSSProperties = {
  background: "transparent",
  border: `1px solid ${tokens.border.strong}`,
  color: tokens.text.brightBody,
  borderRadius: tokens.radius.button,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

/** Restore button's solid-white label — documented white-channel exception,
 * same pattern as GraphEmptyState's ADD_BUTTON_TEXT_STYLE. */
const RESTORE_BUTTON_STYLE: CSSProperties = {
  background: tokens.accent.default,
  border: "none",
  color: withAlpha("#ffffff", 1),
  borderRadius: tokens.radius.button,
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

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
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={RECOVERY_TITLE_ID}
      data-testid="recovery-dialog"
      style={SCRIM_STYLE}
    >
      <div className="modal-card" style={CARD_STYLE}>
        <div
          id={RECOVERY_TITLE_ID}
          style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}
        >
          이전 작업을 복구할까요?
        </div>
        <div
          style={{
            fontSize: 12,
            color: tokens.text.secondary,
            marginBottom: 16,
          }}
        >
          저장된 자동 백업이 있습니다 · 노드 {nodeCount}개 · {savedAt}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            data-testid="recovery-discard"
            onClick={onDiscard}
            style={DISCARD_BUTTON_STYLE}
          >
            새로 시작
          </button>
          <button
            ref={restoreButtonRef}
            type="button"
            data-testid="recovery-restore"
            onClick={onRestore}
            style={RESTORE_BUTTON_STYLE}
          >
            복구
          </button>
        </div>
      </div>
    </div>
  );
}

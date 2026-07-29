import { useEffect } from "react";
import { create } from "zustand";

interface HelpModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useHelpModalStore = create<HelpModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

interface ShortcutRow {
  keys: string;
  desc: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: ShortcutGroup[] = [
  {
    title: "Node Graph",
    rows: [
      { keys: "Click", desc: "노드 선택" },
      { keys: "Shift + Drag", desc: "영역으로 다중 선택" },
      { keys: "Shift + Click", desc: "선택에 노드 추가/제거" },
      { keys: "Drag", desc: "노드 이동 (다중 선택 시 그룹 이동)" },
      { keys: "Delete · Backspace", desc: "선택된 노드 삭제" },
      { keys: "Drag handle → handle", desc: "포트 연결 (같은 타입만)" },
    ],
  },
  {
    title: "View / Pan / Zoom",
    rows: [
      { keys: "Scroll", desc: "줌 인 / 아웃" },
      { keys: "Drag (빈 영역)", desc: "화면 패닝" },
      { keys: "더블 클릭 (빈 영역)", desc: "fit-view 리셋" },
    ],
  },
  {
    title: "Global",
    rows: [
      { keys: `${MOD} + Z`, desc: "Undo (그래프 편집)" },
      { keys: `${MOD} + Shift + Z`, desc: "Redo" },
      { keys: `${MOD} + Y`, desc: "Redo (Windows 스타일)" },
      { keys: `${MOD} + K`, desc: "Command Palette 열기" },
      {
        keys: "Space",
        desc: "재생 / 일시정지 (입력 · 버튼 포커스 외)",
      },
    ],
  },
];

interface HelpModalViewProps {
  onClose: () => void;
}

export function HelpModalView({ onClose }: HelpModalViewProps) {
  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      data-testid="help-modal"
    >
      <div className="cmdk-modal help-modal">
        <div className="help-modal__header">
          <span id="help-modal-title">Shortcuts &amp; Gestures</span>
          <button
            type="button"
            className="help-modal__close"
            onClick={onClose}
            aria-label="Close help"
          >
            ✕
          </button>
        </div>
        <div className="help-modal__body">
          {GROUPS.map((g) => (
            <section key={g.title} className="help-modal__section">
              <h3 className="help-modal__section-title">{g.title}</h3>
              <ul className="help-modal__list">
                {g.rows.map((r) => (
                  <li key={r.keys} className="help-modal__row">
                    <kbd className="help-modal__keys">{r.keys}</kbd>
                    <span className="help-modal__desc">{r.desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="cmdk-hint">
          <span>Esc · 바깥 클릭 → 닫기</span>
        </div>
      </div>
    </div>
  );
}

export function HelpModal() {
  const open = useHelpModalStore((s) => s.open);
  const setOpen = useHelpModalStore((s) => s.setOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return <HelpModalView onClose={() => setOpen(false)} />;
}

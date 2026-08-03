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

// Coordinate-system facts, verified against the code paths that establish
// each convention (see the file:line references in the sibling comments —
// keep this list in sync if those paths change; do not add unverified
// claims). Reuses `ShortcutRow`: `keys` holds the term, `desc` the
// explanation, so the existing help-modal__* markup renders it unchanged.
const COORDINATE_NOTES: ShortcutRow[] = [
  {
    // src/shaders/fullscreen.vert
    keys: "v_uv",
    desc: "(0,0)=좌하단 · (1,1)=우상단. fullscreen.vert가 v_uv = a_position*0.5+0.5 로 만든다 (NDC (-1,-1)=좌하단)",
  },
  {
    keys: "gl_FragCoord",
    desc: "픽셀 단위·좌하단 원점(WebGL 규약). u_resolution으로 나누면 v_uv와 같은 공간",
  },
  {
    // src/state/mouseStore.ts (header comment) + src/core/graph/execute.ts:148-159
    keys: "u_mouse",
    desc: "vec4 — xy=현재 위치, zw=마지막 클릭. 픽셀 단위·좌하단 원점(Shadertoy iMouse 관례). resolutionScale<1 패스에서는 패스 크기에 맞게 자동 스케일된다",
  },
  {
    // src/core/gl/texture.ts:51-55
    keys: "Image 업로드",
    desc: "UNPACK_FLIP_Y_WEBGL로 뒤집어 올린다 — 이미지 맨 윗줄이 v_uv.y=1. 그래서 texture(u_img, v_uv)가 화면과 같은 방향",
  },
  {
    // src/core/thumbnail/asyncReadback.ts:54-56, 102
    keys: "노드 썸네일",
    desc: "readback 전에 GPU에서 Y를 미리 뒤집어 브라우저 ImageData(상단 원점) 순서로 만든다 — 뷰포트와 썸네일이 같은 방향인 이유",
  },
];

const COORDINATE_INTRO =
  "이 앱의 모든 셰이더 좌표는 좌하단 원점으로 정렬돼 있다 — 각 경로가 그걸 어떻게 맞추는지:";

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
          <section
            className="help-modal__section"
            data-testid="help-coordinates"
          >
            <h3 className="help-modal__section-title">Coordinate Spaces</h3>
            <p className="help-modal__desc">{COORDINATE_INTRO}</p>
            <ul className="help-modal__list">
              {COORDINATE_NOTES.map((r) => (
                <li key={r.keys} className="help-modal__row">
                  <kbd className="help-modal__keys">{r.keys}</kbd>
                  <span className="help-modal__desc">{r.desc}</span>
                </li>
              ))}
            </ul>
          </section>
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

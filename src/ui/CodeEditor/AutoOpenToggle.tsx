import { useEditorStore } from "../../state/editorStore";

/** W5 — Code 자동 접기/펼침 토글(design/App Shell.dc.html L324·L939-945).
 * 동작을 소유한 Code 패널이 토글도 소유한다(툴바 아님). 접힘 레일에선
 * `.code-stage-strip` 자체가 숨어 함께 사라진다(dc 동일).
 * [X2] 라벨은 'Auto: ON/OFF'로 단축(CHANGELOG §v2.1) — 34px 스트립에서
 * 안 넘침, 극한 폭에서만 .code-auto-toggle-label이 ellipsis. */
const TITLE_ON =
  "Auto-open Code is ON — selecting a Shader node opens this panel, " +
  "selecting others collapses it. Click to switch to manual.";
const TITLE_OFF =
  "Auto-open Code is OFF — the panel only opens/closes when you toggle it. " +
  "Click to let node selection open it automatically.";

export function AutoOpenToggle() {
  const autoCode = useEditorStore((s) => s.autoCode);
  const setAutoCode = useEditorStore((s) => s.setAutoCode);
  return (
    <button
      type="button"
      data-testid="code-auto-open-toggle"
      data-auto={autoCode}
      title={autoCode ? TITLE_ON : TITLE_OFF}
      className={
        autoCode ? "code-auto-toggle code-auto-toggle--on" : "code-auto-toggle"
      }
      onClick={() => setAutoCode(!autoCode)}
    >
      <span className="code-auto-toggle-dot" aria-hidden="true" />
      <span className="code-auto-toggle-label">
        {autoCode ? "Auto: ON" : "Auto: OFF"}
      </span>
    </button>
  );
}

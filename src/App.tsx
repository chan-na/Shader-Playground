import { useRef } from "react";
import { useDebugUiStore } from "./state/debugUiStore";
import { useLayoutStore } from "./state/layoutStore";
import { AppToolbar } from "./ui/AppToolbar";
import { BootstrapGate } from "./ui/BootstrapGate";
import { CodeEditor } from "./ui/CodeEditor";
import { CommandPalette } from "./ui/CommandPalette";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ExportShareDialog } from "./ui/ExportShare/ExportShareDialog";
import { KeyboardShortcuts } from "./ui/KeyboardShortcuts";
import { NodeEditor } from "./ui/NodeEditor";
import { DiagnosticsPanel } from "./ui/Panels/DiagnosticsPanel";
import { SidePanel } from "./ui/Panels/SidePanel";
import { StatusBar } from "./ui/Panels/StatusBar";
import { Splitter } from "./ui/Splitter";
import { Toasts } from "./ui/Toasts";
import { Viewport } from "./ui/Viewport";

/** 조건부 className을 공백으로 이어붙이는 최소 헬퍼(falsy는 생략). */
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function App() {
  const diagOpen = useDebugUiStore((s) => s.open);
  const leftFrac = useLayoutStore((s) => s.leftFrac);
  const viewportFrac = useLayoutStore((s) => s.viewportFrac);
  const codeHeight = useLayoutStore((s) => s.codeHeight);
  const setLeftFrac = useLayoutStore((s) => s.setLeftFrac);
  const setViewportFrac = useLayoutStore((s) => s.setViewportFrac);
  const setCodeHeight = useLayoutStore((s) => s.setCodeHeight);
  const nodeEditorCollapsed = useLayoutStore((s) => s.collapsed.nodeEditor);
  const viewportCollapsed = useLayoutStore((s) => s.collapsed.viewport);
  const sidePanelCollapsed = useLayoutStore((s) => s.collapsed.sidePanel);
  const codeEditorCollapsed = useLayoutStore((s) => s.collapsed.codeEditor);
  const maximized = useLayoutStore((s) => s.maximized);

  // shell-main의 폭은 shell-left/shell-right 분배에, 높이는 shell-right 내부
  // (Viewport/SidePanel) 분배에 쓰인다 — shell-right는 shell-main과 같은 높이로
  // stretch되므로 별도 ref 없이 이 하나로 두 계산 모두 충분하다.
  const shellMainRef = useRef<HTMLDivElement>(null);

  // ── 최대화/접기 파생 상태 ─────────────────────────────────────────
  // 최대화된 패널이 있으면 그 패널로 가는 조상 분기만 남기고 나머지
  // 슬롯·스플리터는 전부 display:none(shell-slot--hidden). 패널 자체는
  // 절대 언마운트하지 않는다 — 아래 JSX는 4개 패널을 항상 렌더한다.
  const anySplitterHidden = maximized !== null;
  const shellMainHidden = maximized === "codeEditor";
  const shellRightHidden =
    maximized !== null && maximized !== "viewport" && maximized !== "sidePanel";
  const nodeEditorHidden = maximized !== null && maximized !== "nodeEditor";
  const viewportHidden = maximized !== null && maximized !== "viewport";
  const sidePanelHidden = maximized !== null && maximized !== "sidePanel";
  const codeEditorHidden = maximized !== null && maximized !== "codeEditor";

  const shellLeftFlex =
    maximized === "nodeEditor"
      ? "1"
      : nodeEditorCollapsed
        ? "0 0 34px"
        : `${leftFrac} 1 0px`;
  const shellRightFlex =
    maximized === "viewport" || maximized === "sidePanel"
      ? "1"
      : `${1 - leftFrac} 1 0px`;
  const shellRightTopFlex =
    maximized === "viewport"
      ? "1"
      : viewportCollapsed
        ? "0 0 34px"
        : `${viewportFrac} 1 0px`;
  const shellRightBottomFlex =
    maximized === "sidePanel"
      ? "1"
      : sidePanelCollapsed
        ? "0 0 34px"
        : `${1 - viewportFrac} 1 0px`;
  const shellCodeStyle =
    maximized === "codeEditor"
      ? { flex: "1 1 auto", height: "auto" }
      : codeEditorCollapsed
        ? { height: 34, flexShrink: 0 }
        : { height: codeHeight, flexShrink: 0 };

  const handleLeftDelta = (deltaPx: number): void => {
    const rect = shellMainRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setLeftFrac(leftFrac + deltaPx / rect.width);
  };

  const handleViewportDelta = (deltaPx: number): void => {
    const rect = shellMainRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return;
    setViewportFrac(viewportFrac + deltaPx / rect.height);
  };

  const handleCodeDelta = (deltaPx: number): void => {
    // 코드 독은 하단에 붙어 있어 스플리터를 아래로 끌면(delta 양수) 높이가
    // 줄고, 위로 끌면(delta 음수) 높이가 늘어난다.
    setCodeHeight(codeHeight - deltaPx);
  };

  return (
    <div className="app-shell">
      <AppToolbar />
      <ErrorBoundary>
        <div className="shell-content">
          <div
            className={cx(
              "shell-main",
              shellMainHidden && "shell-slot--hidden",
            )}
            ref={shellMainRef}
          >
            <div
              className={cx(
                "shell-left",
                nodeEditorCollapsed && "shell-slot--collapsed",
                nodeEditorHidden && "shell-slot--hidden",
              )}
              style={{ flex: shellLeftFlex }}
            >
              <NodeEditor />
            </div>
            <Splitter
              orientation="vertical"
              label="Resize Node Editor and right column"
              onDelta={handleLeftDelta}
              className={cx(anySplitterHidden && "shell-slot--hidden")}
            />
            <div
              className={cx(
                "shell-right",
                shellRightHidden && "shell-slot--hidden",
              )}
              style={{ flex: shellRightFlex }}
            >
              <div
                className={cx(
                  "shell-right-top",
                  viewportCollapsed && "shell-slot--collapsed",
                  viewportHidden && "shell-slot--hidden",
                )}
                style={{ flex: shellRightTopFlex }}
              >
                <Viewport />
              </div>
              <Splitter
                orientation="horizontal"
                label="Resize Viewport and Side Panel"
                onDelta={handleViewportDelta}
                className={cx(anySplitterHidden && "shell-slot--hidden")}
              />
              <div
                className={cx(
                  "shell-right-bottom",
                  sidePanelCollapsed && "shell-slot--collapsed",
                  sidePanelHidden && "shell-slot--hidden",
                )}
                style={{ flex: shellRightBottomFlex }}
              >
                <SidePanel />
              </div>
            </div>
          </div>
          <Splitter
            orientation="horizontal"
            label="Resize Code Editor dock"
            onDelta={handleCodeDelta}
            className={cx(anySplitterHidden && "shell-slot--hidden")}
          />
          <div
            className={cx(
              "shell-code",
              codeEditorCollapsed && "shell-slot--collapsed",
              codeEditorHidden && "shell-slot--hidden",
            )}
            style={shellCodeStyle}
          >
            <CodeEditor />
          </div>
        </div>
      </ErrorBoundary>
      <div className="statusbar">
        <StatusBar />
      </div>
      <CommandPalette />
      <ExportShareDialog />
      <KeyboardShortcuts />
      <BootstrapGate />
      <Toasts />
      {diagOpen && <DiagnosticsPanel />}
    </div>
  );
}

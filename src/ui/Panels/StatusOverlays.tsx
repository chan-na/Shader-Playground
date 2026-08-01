import { useBootstrapStore } from "../../state/bootstrapStore";
import { useDebugUiStore } from "../../state/debugUiStore";
import { tokens } from "../../theme";
import { DiagnosticsMetricStrip } from "./DiagnosticsMetricStrip";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { PanelSkeleton } from "./PanelSkeleton";
import { PassInspector } from "./PassInspector";
import { ProblemsPanel } from "./ProblemsPanel";

/**
 * 하단 트랜지언트 오버레이 (design/CHANGELOG.md §v1.4 R5,
 * `App Shell.dc.html` L403-433): problems/diagnostics/passes는 도킹 5종에
 * 속하지 않는 상태바 트리거 오버레이다 — `.shell-content` 하단에 절대 배치되는
 * 172px 영역 하나를 diagnostics/problems/passes가 번갈아 차지한다.
 * 순서(T3/T4): 헤더 → 26px 메트릭 스트립(diagnostics 전용, T4) → 패널 본문
 * (X12로 카드 제거 — 메트릭은 스트립 유일 경로).
 *
 * **passes(Pass Inspector, T1/D-1)는 design/ 정본(v2.2)이 정의하지 않는
 * 3번째 슬롯이다** — dc는 이 영역이 diagnostics/problems 2종으로만
 * 시분할된다고만 말한다. `debugUiStore`의 3원 배타 확장과 함께 잠정 결정으로
 * 도입했고 **design-request v2.3 (AA1)**로 발행됐다(정본 확정 시 갱신).
 *
 * 상호 배타는 debugUiStore(U1, R5 + T1 3원 확장)가 스토어 레벨에서
 * 보장하지만(하나를 켜면 나머지 둘이 꺼진다), 여기서는 방어적으로
 * open > problemsOpen > passesOpen 순으로 우선한다.
 *
 * 헤더는 제목 텍스트만 그린다 — dc L406-417에 보이는 필터칩/Copy/Clear/✕는
 * 콘텐츠 정본인 `Side Panel.dc.html` 기반 DiagnosticsPanel 내부 툴바
 * (diagnostics-copy/clear/close testid)에 이미 있어 중복 렌더하지 않는다
 * (잠정 결정, temp/design-followup-v1.4.md 기록). Pass Inspector는 이런
 * 툴바가 없으므로 헤더는 제목 하나뿐이다.
 */
export function StatusOverlays() {
  const open = useDebugUiStore((s) => s.open);
  const problemsOpen = useDebugUiStore((s) => s.problemsOpen);
  const passesOpen = useDebugUiStore((s) => s.passesOpen);
  const bootPhase = useBootstrapStore((s) => s.phase);

  if (!open && !problemsOpen && !passesOpen) return null;

  const testId = open
    ? "diagnostics-overlay"
    : problemsOpen
      ? "problems-overlay"
      : "passes-overlay";

  return (
    <div
      className="status-overlay"
      data-testid={testId}
      style={{
        // dc L210 box-shadow:0 -14px 34px rgba(0,0,0,0.55) — 대응 토큰 없음.
        // overlay.scrim(rgba(0,0,0,0.5))으로 근사(0.55→0.5) — StatusBar.tsx의
        // TONE_DOT_GLOW 합성 관례와 동일 패턴. followup 기록.
        boxShadow: `0 -14px 34px ${tokens.overlay.scrim}`,
      }}
    >
      <div className="status-overlay-header">
        {open ? "◨ Diagnostics" : problemsOpen ? "⚠ Problems" : "▤ Passes"}
      </div>
      {open ? <DiagnosticsMetricStrip /> : null}
      {/* B5-U4 fix: `flex`/`minHeight:0` alone only size *this* wrapper as a
          flex item of `.status-overlay` — they don't make it a flex
          *container*, so DiagnosticsPanel/ProblemsPanel's own `.panel-body`
          class (`flex: 1 1 auto`) had no effect (that class's `flex`
          shorthand is inert without a flex parent) and each panel grew to
          its natural (taller-than-172px) content height. With `overflow`
          left at its default `visible`, that overflow painted past the
          172px overlay box and covered the StatusBar underneath — an
          e2e-detected regression (phase-16-diagnostics "second click"
          pointer-event interception). `display:flex` + `overflow:hidden`
          here complete the flex chain so each panel's own internal
          `overflowY:auto` scrolls instead of overflowing. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {bootPhase !== "done" ? (
          <PanelSkeleton />
        ) : open ? (
          <DiagnosticsPanel />
        ) : problemsOpen ? (
          <ProblemsPanel />
        ) : (
          <PassInspector />
        )}
      </div>
    </div>
  );
}

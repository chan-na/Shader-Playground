/**
 * 도킹 트리 재귀 flex 렌더러 — B2-U1. `App.tsx`의 하드코딩 4패널 마크업
 * (shell-main/shell-left/shell-right/shell-code + 스플리터 3개)을 대체한다.
 *
 * dc(`Docking Prototype.dc.html`)의 absolute 픽셀 배치 대신 **중첩 flex
 * 재귀**를 쓴다 — 이유: (1) 현행 CSS/셀렉터 계약(`.shell-left` 등) 보존,
 * (2) ResizeObserver 없이 픽셀 동치, (3) `dockTree.layoutDockTree`는 B4
 * 드래그 히트테스트용으로 별도 남는다. flex 수식 `${ratio} 1 0px`은 dc
 * `_layout`의 `aw=(w-D)*ratio`와 동치(playwright viewport 1440×900).
 *
 * ⚠ 패널 언마운트 금지 불변식: 접힘은 CSS(`.shell-slot--collapsed`)로,
 * 최대화는 형제에 `.shell-slot--hidden`으로만 표현한다 — display:none일
 * 뿐 컴포넌트는 항상 마운트 유지(WebGL/CodeMirror 보존). 트리 모양은
 * 리사이즈/접기/최대화/드래그 재도킹 어떤 조작에서도 재귀 위치가 안정적인
 * 한 React가 리마운트하지 않는다.
 * ⚠ S5 각주(v2.0, 이 불변식의 유일한 완화 지점): `leafPanelKind`가
 * `leaf.active` 기준으로 바뀌면서, **이종 탭을 가진 leaf**에서 active를
 * 전환하면 `DockLeafView`가 렌더하는 컴포넌트 자체가 바뀐다(예:
 * `tabs:["nodeEditor","assets"]`에서 active가 assets→nodeEditor로 바뀌면
 * SidePanel이 언마운트되고 NodeEditor가 마운트된다) — 이건 CSS
 * display:none이 아니라 진짜 조건부 렌더링 분기 전환이라 위 불변식이 지키는
 * "컴포넌트는 항상 마운트 유지"가 그 leaf 내부에서는 깨진다. 다만 T1
 * (`dockTree.ts`의 `canMergeDockTabs`)이 viewport/code를 이종 병합
 * 자체에서 배제하므로, WebGL(Viewport)·CodeMirror(CodeEditor)처럼 재초기화
 * 비용이 큰 두 패널은 애초에 이종 leaf에 들어갈 수 없다 — 이 완화가 실제로
 * 영향을 주는 건 nodeEditor/inspector/assets 조합뿐이고, 그중 재마운트
 * 비용이 큰 건 없다(ReactFlow도 매 마운트 상태를 그래프 스토어에서 다시
 * 읽으므로 안전).
 *
 * B4-U3(드래그 엔진 + 고스트/프리뷰 오버레이): `DockLayout` 루트가 드래그
 * 오케스트레이션 전체(pending → 고스트 전환 임계값, 고스트 추적, 드롭
 * 판정, release 처리)를 소유한다 — dc `onMove`/`onUp`(Docking
 * Prototype.dc.html L385-440) 이식. **`pointer*` 이벤트만 사용한다(R10 —
 * mouse 계열/키보드 DnD 금지)**. 트리 변형(분리/재도킹) 자체는
 * `dockStore.detachForDrag`/`dockDetached`(B4-U2)에 위임 — 이 컴포넌트는
 * (1) 임계값/좌표/드롭 판정, (2) 트랜지언트 고스트·프리뷰의 렌더링만
 * 담당한다. 드래그 시작 트리거(`startLeafDrag`/`startTabDrag`)는
 * `DockDragContext`로 서브트리 전체에 내려보낸다 — leaf 헤더(grab
 * handle/탭)의 실제 배선은 B4-U4.
 */

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useDockStore } from "../state/dockStore";
import {
  computeDropTarget,
  DIVIDER_PX,
  type DockDropTarget,
  type DockLeaf,
  type DockNode,
  type DockPanelId,
  type DockPath,
  type DockRegion,
  type DockSplit,
  type DropHit,
  dockPathsEqual,
  fallbackDropTarget,
  findLeafPath,
  layoutDockTree,
} from "../state/dockTree";
import { tokens, withAlpha } from "../theme";
import { CodeEditor } from "./CodeEditor";
import { DockDragContext } from "./dockDragContext";
import {
  GHOST_POINTER_OFFSET,
  ghostSize,
  leafPanelKind,
  legacyLeafClass,
  PANEL_DOTS,
  PANEL_TITLES,
  splitChildFlex,
  splitterLabel,
} from "./dockLayoutModel";
import { DockLeafContext } from "./dockLeafContext";
import { NodeEditor } from "./NodeEditor";
import { SidePanel } from "./Panels/SidePanel";
import { Splitter } from "./Splitter";
import { Viewport } from "./Viewport";

/** 조건부 className을 공백으로 이어붙이는 최소 헬퍼(falsy는 생략). 이전
 * App.tsx의 동일 헬퍼를 이 파일로 복제(그 하드코딩 마크업은 사라졌으므로
 * 헬퍼 자체도 이 렌더러가 단독 소유). */
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** dc `onMove`의 `Math.hypot(e.clientX - d.sx, ...) < 4`(L390) — pending
 * 드래그가 실제 고스트로 전환되는 최소 이동 거리(px). 이보다 작은 이동은
 * 드래그가 아니라 클릭(탭 선택)으로 그대로 통과한다. */
const DRAG_THRESHOLD_PX = 4;

/** R11(반응형) — 컴팩트 도킹 폴백의 임계값. C-6(`src/index.css`의
 * `@container vp-body (max-width: 990px)`, 트랜스포트 바 컴팩트 변형)이 이미
 * 확정한 990px·inclusive(`max-width`, ≤990) 시맨틱을 그대로 재사용한다 — 신규
 * 임계 상수 도입 금지(CHANGELOG §v1.4 R11). C-6은 도킹 패널 내부 크기의
 * container query이고 이건 셸 전체 폭의 media query라 셀렉터 종류는 다르지만
 * 픽셀 값·경계 포함 여부는 동일해야 한다는 게 R11의 요구사항이다. */
const COMPACT_MEDIA_QUERY = "(max-width: 990px)";

/** `useCompactShell`의 `subscribe`. 함수 참조가 안정적이어야
 * `useSyncExternalStore`가 매 렌더 재구독하지 않는다 — 모듈 레벨 함수로 빼서
 * 보장한다. `matchMedia` 미지원 환경(SSR/구형 jsdom 안전망)에서는 구독할
 * 것이 없으므로 빈 cleanup의 no-op. */
function subscribeCompactShell(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** `useCompactShell`의 `getSnapshot` — 매 호출 새 `MediaQueryList`를 만들어도
 * 무방하다(`matches`만 읽고 버림, `subscribe`의 구독 인스턴스와는 별개). */
function getCompactShellSnapshot(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(COMPACT_MEDIA_QUERY).matches;
}

/** R11 — 셸 폭이 컴팩트(≤990px, C-6 임계 재사용) 밴드에 들어왔는지. 도킹
 * 트리 자체(`dockStore.tree`)는 절대 건드리지 않는다 — `DockLayout`이 이
 * 값을 읽어 **렌더만** 세로 스택으로 바꾸는 순수 폴백이다(넓어지면
 * 사용자 레이아웃이 그대로 복원됨). export하지 않는다 — 이 파일(과
 * `DockLayout` 함수) 밖에서 쓸 일이 없다. */
function useCompactShell(): boolean {
  return useSyncExternalStore(subscribeCompactShell, getCompactShellSnapshot);
}

/** compact(R11)에서 드래그 시작 트리거를 무력화하는 공유 no-op — 시그니처가
 * 다른 `startLeafDrag`/`startTabDrag` 양쪽에 그대로 대입 가능하다(인자 0개
 * 함수는 더 많은 인자를 받는 함수 타입에 항상 대입 가능). */
function noopDragStart(): void {}

/** `dockStore.detachForDrag`의 payload 유니온을 이 컴포넌트 로컬로 재선언한
 * 것(구조적으로 동일 — export된 타입이 없어 여기서 그대로 표현한다). */
type DetachPayload =
  | { mode: "leaf"; path: DockPath }
  | { mode: "tab"; id: DockPanelId };

/** pointerdown 시점에 기록해두는 "아직 고스트로 전환되지 않은" 드래그 후보.
 * `sx`/`sy`는 시작 클라이언트 좌표(임계값 판정용, dc `d.sx`/`d.sy`). */
interface PendingDrag {
  payload: DetachPayload;
  sx: number;
  sy: number;
}

/** 커서를 따라다니는 트랜지언트 드래그 고스트의 렌더 상태. dc의
 * `state.ghost`(L252·L398-409) 이식 — `x`/`y`는 컨테이너 상대 좌표. */
interface GhostState {
  tabs: DockPanelId[];
  active: DockPanelId;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** 도킹 레이아웃 루트. `App.tsx`의 `.shell-content` 안에서 하나만 렌더된다. */
export function DockLayout() {
  const tree = useDockStore((s) => s.tree);
  const maximized = useDockStore((s) => s.maximized);
  const compact = useCompactShell();

  const rootRef = useRef<HTMLDivElement>(null);
  // pending/ghost/drop의 "최신값"은 ref로 들고 있다가 window pointer
  // 리스너(아래 useEffect) 안에서 읽는다 — 리스너 함수 자체는 armed/
  // hasGhost가 바뀔 때만 재생성되므로, React state를 직접 클로저로 캡처하면
  // 매 pointermove마다 stale해진다(그렇다고 ghost/drop을 effect의 deps에
  // 넣으면 매 pointermove(=매 프레임에 가까운 setState)마다 리스너를
  // 떼었다 다시 붙이게 된다 — 아래 useEffect의 deps 주석 참고, lint
  // suppression 없이 해소하는 구조다).
  const pendingRef = useRef<PendingDrag | null>(null);
  const ghostRef = useRef<GhostState | null>(null);
  const dropRef = useRef<DropHit | null>(null);

  const [armed, setArmed] = useState(false);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [drop, setDrop] = useState<DropHit | null>(null);

  const startLeafDrag = useCallback((path: DockPath, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pendingRef.current = {
      payload: { mode: "leaf", path },
      sx: e.clientX,
      sy: e.clientY,
    };
    setArmed(true);
  }, []);

  const startTabDrag = useCallback((id: DockPanelId, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pendingRef.current = {
      payload: { mode: "tab", id },
      sx: e.clientX,
      sy: e.clientY,
    };
    setArmed(true);
  }, []);

  // R11: compact(≤990px)에서는 grab handle/탭 pointerdown이 애초에
  // startLeafDrag/startTabDrag를 호출하지 않도록(DockPanelHeader의
  // dragEnabled 분기) 공유 no-op으로 교체한다 — 드래그 오케스트레이션
  // 자체(아래 pointer 리스너)는 손대지 않고 "시작 트리거"만 차단한다.
  const dragContextValue = useMemo(
    () =>
      compact
        ? {
            startLeafDrag: noopDragStart,
            startTabDrag: noopDragStart,
            dragEnabled: false,
          }
        : { startLeafDrag, startTabDrag, dragEnabled: true },
    [compact, startLeafDrag, startTabDrag],
  );

  const hasGhost = ghost !== null;

  // pending/ghost/drop 세션을 전부 취소하는 공유 헬퍼. 아래 두 useEffect
  // (pointer 리스너, 컴팩트 진입 정리) 양쪽에서 쓴다 — ref만 건드리고
  // setState 세터는 stable이라 매 렌더 재생성돼도 참조상 문제는 없지만,
  // deps 배열에 넣어 의도를 명시하기 위해 useCallback으로 안정화한다.
  const endDragSession = useCallback((): void => {
    pendingRef.current = null;
    ghostRef.current = null;
    dropRef.current = null;
    setArmed(false);
    setGhost(null);
    setDrop(null);
  }, []);

  // R11: 좁은 화면으로 전환되는 순간 진행 중인 드래그 세션을 정리한다.
  // pending뿐이면(고스트 미전환) 트리가 아직 안 건드려졌으므로 단순 취소로
  // 충분하다. 이미 고스트로 전환됐다면(detachForDrag로 트리에서 분리된
  // 상태) 단순 취소는 그 패널을 유실시킨다(R1 '플로팅/유실 없음' 불변식
  // 위반) — dockDetached로 폴백 타깃에 강제 도킹한 뒤 세션을 정리한다.
  // `compact`만 deps에 두면 되는 이유는 handleUp과 동일: region 계산에
  // 필요한 tree/rect는 이 시점에 useDockStore.getState()/rootRef로 1회
  // 읽으면 충분하고 구독할 필요가 없다.
  useEffect(() => {
    if (!compact) return;
    const activeGhost = ghostRef.current;
    if (activeGhost !== null) {
      const rect = rootRef.current?.getBoundingClientRect();
      const { regions } = layoutDockTree(
        useDockStore.getState().tree,
        rect?.width ?? 0,
        rect?.height ?? 0,
      );
      useDockStore
        .getState()
        .dockDetached(
          activeGhost.tabs,
          activeGhost.active,
          dropRef.current?.target ?? fallbackDropTarget(regions),
        );
    }
    endDragSession();
  }, [compact, endDragSession]);

  // deps는 armed/hasGhost(둘 다 불리언 state) + endDragSession(useCallback으로
  // 안정화된 함수, 빈 deps라 재생성되지 않음) 뿐이다 — 리스너 내부에서
  // 필요한 최신 pending/ghost/drop/tree는 전부 ref(pendingRef/ghostRef/
  // dropRef, 안정적)나 useDockStore.getState()(구독이 아닌 1회성 읽기)로
  // 읽으므로 useExhaustiveDependencies가 요구하는 의존성은 이미 이
  // 배열뿐이다(ref/setState 세터는 stable이라 규칙이 요구하지 않는다).
  // ghost 객체 자체를 deps로 두면 매 pointermove(setGhost)마다 리스너를
  // 재부착하게 되므로 대신 hasGhost 불리언으로 변환해 넣는다.
  useEffect(() => {
    if (!armed && !hasGhost) return;

    function handleMove(e: { clientX: number; clientY: number }): void {
      const pending = pendingRef.current;
      if (pending !== null) {
        const moved = Math.hypot(
          e.clientX - pending.sx,
          e.clientY - pending.sy,
        );
        if (moved < DRAG_THRESHOLD_PX) return;

        const rect = rootRef.current?.getBoundingClientRect();
        if (rect === undefined) {
          // 컨테이너가 측정 불가(방어적 케이스) — 드래그를 시작할 수 없다.
          endDragSession();
          return;
        }

        // detach 전에(!) region을 찾는다 — detachForDrag가 소스 leaf를
        // 트리에서 제거해버리면 그 region은 다음 layout에서 사라진다.
        const { regions } = layoutDockTree(
          useDockStore.getState().tree,
          rect.width,
          rect.height,
        );
        let region: DockRegion | undefined;
        if (pending.payload.mode === "leaf") {
          const path = pending.payload.path;
          region = regions.find((r) => dockPathsEqual(r.path, path));
        } else {
          const id = pending.payload.id;
          region = regions.find((r) => r.leaf.tabs.includes(id));
        }
        const size = ghostSize(
          pending.payload.mode,
          region === undefined ? null : { w: region.w, h: region.h },
        );

        const result = useDockStore.getState().detachForDrag(pending.payload);
        if (result === null) {
          // 소스가 더 이상 유효하지 않다(방어적 케이스) — pending만 취소.
          endDragSession();
          return;
        }

        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const next: GhostState = {
          tabs: result.tabs,
          active: result.active,
          w: size.w,
          h: size.h,
          x: px - GHOST_POINTER_OFFSET.x,
          y: py - GHOST_POINTER_OFFSET.y,
        };
        pendingRef.current = null;
        ghostRef.current = next;
        setGhost(next);
        return;
      }

      const current = ghostRef.current;
      if (current === null) return;
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect === undefined) return;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nextGhost: GhostState = {
        ...current,
        x: px - GHOST_POINTER_OFFSET.x,
        y: py - GHOST_POINTER_OFFSET.y,
      };
      ghostRef.current = nextGhost;
      setGhost(nextGhost);

      const { regions } = layoutDockTree(
        useDockStore.getState().tree,
        rect.width,
        rect.height,
      );
      const hit = computeDropTarget(px, py, rect.width, rect.height, regions);
      dropRef.current = hit;
      setDrop(hit);
    }

    function handleUp(): void {
      const current = ghostRef.current;
      if (current === null) {
        // 임계값을 못 넘긴 채 놓인 pending-only pointerup — 드래그로
        // 전환되지 않았으므로 pending만 정리한다. 탭의 onClick(선택)은
        // 이 pointerup과 별개 이벤트라 그대로 발화한다(정지시키지 않음).
        endDragSession();
        return;
      }

      // R1: 드롭 타깃이 없어도(밴드/region 밖) 반드시 도킹한다 — 뜬 상태로
      // 남는 경우는 없다. dc `onUp`의 `this.dc.dropTarget ||
      // this._fallbackTarget()`(L436) 이식.
      const rect = rootRef.current?.getBoundingClientRect();
      const { regions } = layoutDockTree(
        useDockStore.getState().tree,
        rect?.width ?? 0,
        rect?.height ?? 0,
      );
      const target: DockDropTarget =
        dropRef.current?.target ?? fallbackDropTarget(regions);
      useDockStore
        .getState()
        .dockDetached(current.tabs, current.active, target);
      endDragSession();
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [armed, hasGhost, endDragSession]);

  const maxPath =
    tree === null || maximized === null ? null : findLeafPath(tree, maximized);

  return (
    <div
      ref={rootRef}
      className={cx(
        "dock-root",
        compact && "dock-root--compact",
        hasGhost && "dock-root--dragging",
      )}
    >
      <DockDragContext.Provider value={dragContextValue}>
        {tree === null ? (
          // R1 정본 카피 — v1.3의 "drop a floating panel here"는 폐기됐다
          // (플로팅 없음). ＋ Panel 버튼 자체는 B6에서 툴바에 붙는다. 트리가
          // null이어도 이 분기는 `.dock-root` 컨테이너 **안**에 있다 —
          // 마지막 남은 패널을 드래그로 분리하는 중에는 트리가 일시적으로
          // null이 되지만 고스트/프리뷰 오버레이와 pointer 리스너는 계속
          // 살아있어야 하기 때문이다.
          <div className="dock-empty" data-testid="dock-empty">
            <div className="dock-empty-icon" aria-hidden="true">
              ⊞
            </div>
            <div>No panels docked — add one with ＋ Panel</div>
          </div>
        ) : (
          <DockNodeView
            node={tree}
            path={[]}
            flex="1"
            maxRemaining={maxPath}
            hidden={false}
            compact={compact}
          />
        )}
      </DockDragContext.Provider>

      {drop !== null && (
        <div
          className="dock-drop-preview"
          style={{
            left: drop.preview.x,
            top: drop.preview.y,
            width: drop.preview.w,
            height: drop.preview.h,
            // rgba(accent,0.14) 파생 — CSS 변수로 못 만들어 인라인
            // withAlpha(theme.ts 관례, 예: AppToolbar.tsx의 동일 패턴).
            background: withAlpha(tokens.accent.default, 0.14),
          }}
        >
          <span
            className="dock-drop-preview-label"
            style={{
              // 배경 withAlpha(surface.app,0.85) · 보더 withAlpha(accent,0.4)
              // — 둘 다 hex 알파 파생이라 CSS 변수 불가(인라인 관례 유지).
              background: withAlpha(tokens.surface.app, 0.85),
              border: `1px solid ${withAlpha(tokens.accent.default, 0.4)}`,
            }}
          >
            {drop.label}
          </span>
        </div>
      )}

      {ghost !== null && (
        <div
          className="dock-drag-ghost"
          data-testid="dock-drag-ghost"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.w,
            height: ghost.h,
            // dc box-shadow `0 22px 54px rgba(0,0,0,0.66), 0 0 0 1px
            // rgba(61,155,255,0.5)`(L609) — 앞부분은 shadow.modal 근사(둘 다
            // "모달급 부유 요소"의 큰 드롭섀도), accent 링은
            // withAlpha(accent,0.5)로 합성(CSS 변수로 못 만드는 알파 파생).
            boxShadow: `${tokens.shadow.modal}, 0 0 0 1px ${withAlpha(tokens.accent.default, 0.5)}`,
          }}
        >
          <div className="dock-drag-ghost-header">
            <span className="dock-header-grab" aria-hidden="true">
              ⣿
            </span>
            <span
              className="panel-tab-dot"
              style={{ background: PANEL_DOTS[ghost.active] }}
              aria-hidden="true"
            />
            <span className="dock-drag-ghost-title">
              {PANEL_TITLES[ghost.active]}
            </span>
            {ghost.tabs.length > 1 && (
              <span className="dock-drag-ghost-count">
                +{ghost.tabs.length - 1}
              </span>
            )}
          </div>
          <div
            className="dock-drag-ghost-body"
            style={{ background: withAlpha(tokens.surface.panel, 0.6) }}
          >
            moving…
          </div>
        </div>
      )}
    </div>
  );
}

interface DockNodeViewProps {
  node: DockNode;
  path: DockPath;
  flex: string;
  /** 루트에서 이 노드까지 온 나머지 최대화 경로. `null`이면 이 서브트리
   * 어디에도 최대화된 leaf가 없다는 뜻(또는 애초에 아무것도 최대화되지
   * 않음). */
  maxRemaining: DockPath | null;
  /** 조상 split이 이 서브트리를 최대화 때문에 숨기기로 정했는지. */
  hidden: boolean;
  /** R11 — 셸이 컴팩트(≤990px) 밴드인지. 트리 구조는 그대로 두고 렌더만
   * 세로 스택으로 바꾼다(`DockSplitView`는 스플리터를 그리지 않고,
   * `DockLeafView`는 flex를 `0 0 auto`로 고정 — 나머지는 `.dock-root--compact`
   * CSS가 처리). */
  compact: boolean;
}

function DockNodeView({
  node,
  path,
  flex,
  maxRemaining,
  hidden,
  compact,
}: DockNodeViewProps) {
  if (node.type === "leaf") {
    return (
      <DockLeafView
        leaf={node}
        path={path}
        flex={flex}
        hidden={hidden}
        compact={compact}
      />
    );
  }
  return (
    <DockSplitView
      node={node}
      path={path}
      flex={flex}
      maxRemaining={maxRemaining}
      hidden={hidden}
      compact={compact}
    />
  );
}

interface DockSplitViewProps {
  node: DockSplit;
  path: DockPath;
  flex: string;
  maxRemaining: DockPath | null;
  hidden: boolean;
  compact: boolean;
}

function DockSplitView({
  node,
  path,
  flex,
  maxRemaining,
  hidden,
  compact,
}: DockSplitViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setDividerRatio = useDockStore((s) => s.setDividerRatio);
  const { a: aFlex, b: bFlex, showDivider } = splitChildFlex(node);
  const head = maxRemaining === null ? null : (maxRemaining[0] ?? null);
  const rest = maxRemaining === null ? null : maxRemaining.slice(1);

  const handleDelta = (deltaPx: number): void => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const span = (node.dir === "row" ? rect.width : rect.height) - DIVIDER_PX;
    if (span <= 0) return;
    setDividerRatio(path, node.ratio + deltaPx / span, rect.width, rect.height);
  };

  return (
    <div
      ref={ref}
      className={cx(
        "dock-split",
        node.dir === "row" ? "dock-split--row" : "dock-split--col",
        hidden && "shell-slot--hidden",
      )}
      style={{ flex }}
    >
      <DockNodeView
        node={node.a}
        path={[...path, "a"]}
        flex={head === "a" ? "1" : aFlex}
        maxRemaining={head === "a" ? rest : null}
        hidden={head === "b"}
        compact={compact}
      />
      {/* R11: 컴팩트에서는 스플리터를 렌더하지 않는다 — 실수 드래그 방지
          (드롭 프리뷰/고스트와 마찬가지로 재도킹 표면 전체가 사라진다).
          자리(showDivider일 때의 placeholder)는 그대로 유지되므로 형제
          leaf들의 React 위치는 안정적이다(리마운트 없음, 기존
          showDivider 분기와 동일 메커니즘). */}
      {!compact && showDivider && (
        <Splitter
          orientation={node.dir === "row" ? "vertical" : "horizontal"}
          label={splitterLabel(node)}
          onDelta={handleDelta}
          className={cx(head !== null && "shell-slot--hidden")}
        />
      )}
      <DockNodeView
        node={node.b}
        path={[...path, "b"]}
        flex={head === "b" ? "1" : bFlex}
        maxRemaining={head === "b" ? rest : null}
        hidden={head === "a"}
        compact={compact}
      />
    </div>
  );
}

interface DockLeafViewProps {
  leaf: DockLeaf;
  path: DockPath;
  flex: string;
  hidden: boolean;
  compact: boolean;
}

function DockLeafView({
  leaf,
  path,
  flex,
  hidden,
  compact,
}: DockLeafViewProps) {
  const kind = leafPanelKind(leaf);
  return (
    <div
      className={cx(
        "dock-leaf",
        legacyLeafClass(leaf) ?? undefined,
        leaf.collapsed === true && "shell-slot--collapsed",
        hidden && "shell-slot--hidden",
      )}
      // R11: 인라인 style이 CSS보다 우선 적용되므로(specificity와 무관하게
      // 항상 이긴다), 컴팩트 고정 스택 flex는 CSS가 아니라 여기서 분기한다
      // — `.dock-root--compact .dock-leaf { height: 46vh }`(index.css)는
      // 세로 스택 각 항목의 높이만 담당하고, 폭 방향으로 늘어나지 않게
      // 막는 `0 0 auto`는 이 인라인 값이 담당한다.
      style={{ flex: compact ? "0 0 auto" : flex }}
    >
      <DockLeafContext.Provider value={{ leafId: leaf.id, path }}>
        {kind === "nodeEditor" && <NodeEditor />}
        {kind === "viewport" && <Viewport />}
        {kind === "sidePanel" && <SidePanel />}
        {kind === "code" && <CodeEditor />}
      </DockLeafContext.Provider>
    </div>
  );
}

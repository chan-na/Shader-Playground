/**
 * 도킹 스토어 — 이전의 고정 4패널 레이아웃 스토어를 대체한(B2에서 완전
 * 이관·삭제) 트리 기반 도크 모델(v1.4 R1~R7)의 zustand 상태.
 *
 * B1에서는 순수 상태만 다룬다 — 렌더러 연결은 B2, 영속화(R9 localStorage)는
 * B6에서 붙는다. 상태는 의도적으로 순수 JSON 직렬화 가능 형태를 유지한다
 * (`{ tree, maximized, nextLeafId }` — 함수/클래스 인스턴스 없음, R9 준비).
 * B4-U2에서 드래그 분리/재도킹 액션(`detachForDrag`/`dockDetached`)을
 * 추가했다 — 트랜지언트 고스트 자체(위치/사이즈/렌더링)는 B4-U3의 책임이고,
 * 이 스토어는 dc `onMove`/`dockGhost`의 트리 변형 절반만 담당한다.
 *
 * 모든 트리 갱신은 `./dockTree`의 불변 함수(`getNodeAt`/`setNodeAt`/
 * `removePanel`/`findLeafPath`/`findTabLeafPath`/`firstMergeableLeafPath`/
 * `collectPanelIds`/`clampDividerRatio`/`insertDetachedLeaf`) 경유 — 이
 * 파일 안에서 트리 노드를 직접 변이하지 않는다. 순환 의존성 방지를 위해
 * 다른 store는 import하지 않는다.
 */

import { create } from "zustand";
import {
  clampDividerRatio,
  collectPanelIds,
  createDefaultDockTree,
  type DockDropTarget,
  type DockLeaf,
  type DockNode,
  type DockPanelId,
  type DockPath,
  findLeafPath,
  findTabLeafPath,
  firstMergeableLeafPath,
  getNodeAt,
  insertDetachedLeaf,
  removePanel,
  setNodeAt,
} from "./dockTree";

export interface DockState {
  /** 도킹 트리. `null` = 모든 패널이 닫힌 empty state. */
  tree: DockNode | null;
  /** 최대화된 leaf의 id. `collapsed`와 병존한다(R4). 없으면 `null`. */
  maximized: string | null;
  /** 다음에 생성할 leaf id의 숫자 접미사. 기본 트리가 l1~l4를 쓰므로 5부터
   * 시작 — 재로드 후 id 충돌 방지를 위해 직렬화 대상(R9 준비). */
  nextLeafId: number;

  /** 지정 경로 leaf의 활성 탭을 바꾼다. dc `setActive`(L489-492) 이식 —
   * leaf가 아니거나 `id`가 그 leaf의 탭이 아니면 방어적으로 no-op(dc는
   * 무조건 대입하지만 여기선 안전하게 검증한다). */
  setActiveTab: (path: DockPath, id: DockPanelId) => void;
  /** 지정 경로 split의 분할 비율을 바꾼다(R7). `spanW`/`spanH`는
   * `layoutDockTree`가 divider에 실어주는 값을 드래그 핸들러가 그대로
   * 전달한다(B2). split이 아닌 경로는 no-op. */
  setDividerRatio: (
    path: DockPath,
    ratio: number,
    spanW: number,
    spanH: number,
  ) => void;
  /** 지정 경로 leaf의 접힘 상태를 반전한다. dc `toggleCollapse`
   * (L505-508) 이식 — 접기 조작은 최대화를 항상 해제한다(dc 정본). */
  toggleCollapsed: (path: DockPath) => void;
  /** 지정 패널 id가 속한 leaf의 접힘 상태를 절대값으로 설정한다(W5 Code
   * 자동접기용 — design/CHANGELOG.md §v2.0 W5). 대상 경로는
   * `findTabLeafPath(tree, id)`로 해석하며 패널이 닫혔거나 트리가 비었으면
   * no-op. 이미 원하는 상태면 set 자체를 생략하는 멱등 액션이라 선택 이벤트가
   * 반복 발화해도 렌더/영속화 churn이 없다. `toggleCollapsed`와 달리
   * `maximized`는 **그 leaf 자신이 최대화 중일 때만** 해제한다 — 자동 구동이
   * 무관한 패널의 최대화를 깨지 않기 위한 의도적 차이(dc 미정의 코너). */
  setCollapsed: (id: DockPanelId, collapsed: boolean) => void;
  /** 지정 leaf의 최대화 상태를 토글한다. dc `toggleMaximize`(L509-511) +
   * 이전 고정 레이아웃 스토어의 `toggleMaximized` 관례 병합 — 새로
   * 최대화하는 leaf가 접혀 있었다면 강제로 펼친다(dc는 이 코너를 정의하지
   * 않음). */
  toggleMaximized: (leafId: string) => void;
  /** 패널 하나를 트리에서 제거한다. dc `closeTab`(L493-496) 이식. */
  closeTab: (id: DockPanelId) => void;
  /** 지정 경로 leaf의 모든 탭을 제거한다. dc `closePanel`(L497-504) 이식. */
  closePanel: (path: DockPath) => void;
  /** 닫힌 패널을 재도킹한다(R1: 재오픈은 항상 도킹, 플로팅 없음). dc
   * `addPanel`(L512-523) 이식 — v2.0에서 T1 게이트가 추가됐다:
   * `firstMergeableLeafPath`로 찾은, `id`를 병합해도 viewport/code 이종
   * leaf가 생기지 않는 첫 leaf에만 병합한다. 그런 leaf가 없으면(트리에
   * viewport/code leaf뿐이거나 `id` 자체가 viewport/code인 경우 — 실사용의
   * 기본 케이스) outer-right에 새 leaf를 만들어 패널을 유실 없이
   * 재도킹한다. */
  addPanel: (id: DockPanelId) => void;
  /** 트리/최대화/leaf id 카운터를 기본값으로 되돌린다. dc
   * `resetLayout`(L524-526) 이식. */
  resetLayout: () => void;
  /** 드래그 시작 시 트리에서 leaf 전체 또는 단일 탭을 분리한다. dc
   * `onMove`의 `pending` 분기(L389-411) 중 트리 변형 부분만 이식 — 고스트
   * 위치/사이즈 계산(L396-409의 w/h/x/y)은 B4-U3(렌더러/드래그 핸들러)의
   * 책임이다.
   *
   * - `mode: "leaf"`: 지정 경로가 leaf가 아니면(또는 tree가 `null`이면)
   *   `null`을 반환하고 no-op. leaf면 `{tabs, active}`를 확보한 뒤
   *   `closePanel`과 동일한 `removePanel` 루프로 그 탭 전체를 제거한다.
   * - `mode: "tab"`: `findTabLeafPath`로 해당 탭이 실존하는지 확인하고
   *   (없으면 `null`·no-op) `removePanel` 1회로 그 탭만 제거한다.
   *
   * 두 모드 모두 dc L410처럼 `maximized: null`을 정본으로 강제한다(드래그
   * 시작은 항상 최대화를 해제한다). 반환된 payload는 B4-U3의 트랜지언트
   * 고스트가 들고 있다가 `dockDetached`로 반드시 되돌아온다(R1: 플로팅
   * 없음 — 분리된 패널이 도킹되지 않은 채 남는 경우는 없다). */
  detachForDrag: (
    payload:
      | { mode: "leaf"; path: DockPath }
      | { mode: "tab"; id: DockPanelId },
  ) => { tabs: DockPanelId[]; active: DockPanelId } | null;
  /** 분리된(드래그 중이던) 탭들을 드롭 타깃 위치에 다시 도킹한다. dc
   * `dockGhost`(L466-487)의 스토어 측 절반 — leaf id 발급(dc의
   * `this.dc.uid++`, L468)은 여기서 `nextLeafId` 카운터로 수행하고, 실제
   * 트리 삽입은 `insertDetachedLeaf`(B4-U1)에 위임한다.
   *
   * `tabs.length === 0`이면 no-op(방어 가드 — `detachForDrag`는 항상
   * 비어있지 않은 payload를 반환하므로 정상 경로에서는 도달하지 않지만,
   * 다른 store 액션들의 방어 가드 관례를 따른다). */
  dockDetached: (
    tabs: DockPanelId[],
    active: DockPanelId,
    target: DockDropTarget,
  ) => void;
}

/** 최대화된 leaf가 트리에서 사라졌으면 `maximized`를 정리한다. dc
 * `closeTab`의 `maximized === id ? null : maximized`(L495)는 leaf id와
 * 패널 id를 비교하는 정본 결함이 있어(`toggleMaximize`는 leaf id를 받지만
 * `closeTab`은 panel id로 비교) — 여기서는 "트리에 그 leaf가 실존하는가"로
 * 일반화해 closeTab/closePanel 양쪽에서 공유한다. */
function reconcileMaximized(
  tree: DockNode | null,
  maximized: string | null,
): string | null {
  if (maximized === null) return null;
  return findLeafPath(tree, maximized) === null ? null : maximized;
}

export const useDockStore = create<DockState>((set, get) => ({
  tree: createDefaultDockTree(),
  maximized: null,
  nextLeafId: 5,

  setActiveTab: (path, id) => {
    const { tree } = get();
    if (tree === null) return;
    const node = getNodeAt(tree, path);
    if (node === null || node.type !== "leaf" || !node.tabs.includes(id)) {
      return;
    }
    set({ tree: setNodeAt(tree, path, { ...node, active: id }) });
  },

  setDividerRatio: (path, ratio, spanW, spanH) => {
    const { tree } = get();
    if (tree === null) return;
    const node = getNodeAt(tree, path);
    if (node === null || node.type !== "split") return;
    const clamped = clampDividerRatio(node.dir, spanW, spanH, ratio);
    set({ tree: setNodeAt(tree, path, { ...node, ratio: clamped }) });
  },

  toggleCollapsed: (path) => {
    const { tree } = get();
    if (tree === null) return;
    const node = getNodeAt(tree, path);
    if (node === null || node.type !== "leaf") return;
    set({
      tree: setNodeAt(tree, path, { ...node, collapsed: !node.collapsed }),
      maximized: null,
    });
  },

  setCollapsed: (id, collapsed) => {
    const { tree, maximized } = get();
    if (tree === null) return;
    const path = findTabLeafPath(tree, id);
    if (path === null) return;
    const node = getNodeAt(tree, path);
    if (node === null || node.type !== "leaf") return;
    if (Boolean(node.collapsed) === collapsed) return;
    set({
      tree: setNodeAt(tree, path, { ...node, collapsed }),
      maximized: maximized === node.id ? null : maximized,
    });
  },

  toggleMaximized: (leafId) => {
    const { tree, maximized } = get();
    if (maximized === leafId) {
      set({ maximized: null });
      return;
    }
    if (tree === null) return;
    const path = findLeafPath(tree, leafId);
    if (path === null) return;
    const leaf = getNodeAt(tree, path);
    // findLeafPath는 leaf 경로만 반환하므로 leaf가 아닐 수 없다 — 타입
    // 좁히기를 위한 방어적 가드.
    if (leaf === null || leaf.type !== "leaf") return;
    if (leaf.collapsed === true) {
      // 접힌 채 최대화되면 본문이 보이지 않는다 — 이전 고정 레이아웃
      // 스토어의 관례 이식.
      set({
        tree: setNodeAt(tree, path, { ...leaf, collapsed: false }),
        maximized: leafId,
      });
      return;
    }
    set({ maximized: leafId });
  },

  closeTab: (id) => {
    const { tree, maximized } = get();
    const result = removePanel(tree, id);
    if (!result.found) return;
    set({
      tree: result.node,
      maximized: reconcileMaximized(result.node, maximized),
    });
  },

  closePanel: (path) => {
    const { tree, maximized } = get();
    if (tree === null) return;
    const leaf = getNodeAt(tree, path);
    if (leaf === null || leaf.type !== "leaf") return;
    let cur: DockNode | null = tree;
    for (const id of [...leaf.tabs]) {
      cur = removePanel(cur, id).node;
    }
    set({ tree: cur, maximized: reconcileMaximized(cur, maximized) });
  },

  addPanel: (id) => {
    const { tree, nextLeafId } = get();
    if (collectPanelIds(tree).includes(id)) return;
    if (tree === null) {
      set({
        tree: { type: "leaf", id: `l${nextLeafId}`, tabs: [id], active: id },
        nextLeafId: nextLeafId + 1,
      });
      return;
    }
    const path = firstMergeableLeafPath(tree, id);
    if (path === null) {
      // T1: 병합 가능한 leaf가 트리에 없다(viewport/code는 이종 leaf를
      // 만들지 않으므로 사실상 항상 이 분기다) — outer-right에 새 leaf를
      // 만들어 패널을 유실 없이 재도킹한다(insertDetachedLeaf, R1).
      set({
        tree: insertDetachedLeaf(
          tree,
          { kind: "outer", side: "right" },
          { type: "leaf", id: `l${nextLeafId}`, tabs: [id], active: id },
        ),
        nextLeafId: nextLeafId + 1,
      });
      return;
    }
    const leaf = getNodeAt(tree, path);
    if (leaf === null || leaf.type !== "leaf") return;
    set({
      tree: setNodeAt(tree, path, {
        ...leaf,
        tabs: [...leaf.tabs, id],
        active: id,
        collapsed: false,
      }),
    });
  },

  resetLayout: () => {
    set({ tree: createDefaultDockTree(), maximized: null, nextLeafId: 5 });
  },

  detachForDrag: (payload) => {
    const { tree } = get();
    if (tree === null) return null;

    if (payload.mode === "leaf") {
      const leaf = getNodeAt(tree, payload.path);
      if (leaf === null || leaf.type !== "leaf") return null;
      const tabs = [...leaf.tabs];
      const active = leaf.active;
      let cur: DockNode | null = tree;
      for (const id of tabs) {
        cur = removePanel(cur, id).node;
      }
      set({ tree: cur, maximized: null });
      return { tabs, active };
    }

    // mode === "tab"
    const path = findTabLeafPath(tree, payload.id);
    if (path === null) return null;
    const result = removePanel(tree, payload.id);
    set({ tree: result.node, maximized: null });
    return { tabs: [payload.id], active: payload.id };
  },

  dockDetached: (tabs, active, target) => {
    if (tabs.length === 0) return;
    const { tree, nextLeafId } = get();
    const leaf: DockLeaf = {
      type: "leaf",
      id: `l${nextLeafId}`,
      tabs: [...tabs],
      active,
    };
    set({
      tree: insertDetachedLeaf(tree, target, leaf),
      nextLeafId: nextLeafId + 1,
    });
  },
}));

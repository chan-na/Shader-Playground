/**
 * 도킹 스토어 — 현행 고정 4패널 `layoutStore`를 대체할 트리 기반 도크 모델
 * (v1.4 R1~R7)의 zustand 상태.
 *
 * B1에서는 순수 상태만 다룬다 — 렌더러 연결은 B2, 영속화(R9 localStorage)는
 * B6에서 붙는다. 상태는 의도적으로 순수 JSON 직렬화 가능 형태를 유지한다
 * (`{ tree, maximized, nextLeafId }` — 함수/클래스 인스턴스 없음, R9 준비).
 *
 * 모든 트리 갱신은 `./dockTree`의 불변 함수(`getNodeAt`/`setNodeAt`/
 * `removePanel`/`findLeafPath`/`firstLeafPath`/`collectPanelIds`/
 * `clampDividerRatio`) 경유 — 이 파일 안에서 트리 노드를 직접 변이하지
 * 않는다. 순환 의존성 방지를 위해 다른 store는 import하지 않는다.
 */

import { create } from "zustand";
import {
  clampDividerRatio,
  collectPanelIds,
  createDefaultDockTree,
  type DockNode,
  type DockPanelId,
  type DockPath,
  findLeafPath,
  firstLeafPath,
  getNodeAt,
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
  /** 지정 leaf의 최대화 상태를 토글한다. dc `toggleMaximize`(L509-511) +
   * 현행 `layoutStore.toggleMaximized` 관례 병합 — 새로 최대화하는 leaf가
   * 접혀 있었다면 강제로 펼친다(dc는 이 코너를 정의하지 않음). */
  toggleMaximized: (leafId: string) => void;
  /** 패널 하나를 트리에서 제거한다. dc `closeTab`(L493-496) 이식. */
  closeTab: (id: DockPanelId) => void;
  /** 지정 경로 leaf의 모든 탭을 제거한다. dc `closePanel`(L497-504) 이식. */
  closePanel: (path: DockPath) => void;
  /** 닫힌 패널을 재도킹한다(R1: 재오픈은 항상 도킹, 플로팅 없음). dc
   * `addPanel`(L512-523) 이식. */
  addPanel: (id: DockPanelId) => void;
  /** 트리/최대화/leaf id 카운터를 기본값으로 되돌린다. dc
   * `resetLayout`(L524-526) 이식. */
  resetLayout: () => void;
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
      // 접힌 채 최대화되면 본문이 보이지 않는다 — 현행 layoutStore 관례 이식.
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
    const path = firstLeafPath(tree);
    if (path === null) return; // tree !== null이면 항상 leaf가 존재 — 방어적 가드
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
}));

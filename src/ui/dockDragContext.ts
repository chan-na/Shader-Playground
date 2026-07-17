/**
 * 도킹 드래그 시작 컨텍스트 — B4-U3. `DockLayout`이 드래그 오케스트레이션
 * (pending/ghost 상태, window pointermove/pointerup 리스너)을 전부 소유하고,
 * 그 시작 트리거 두 개(`startLeafDrag`/`startTabDrag`)만 이 컨텍스트로
 * 내려보낸다 — leaf 헤더의 grab handle이나 개별 탭(둘 다 `DockPanelHeader`,
 * B4-U4에서 배선)이 자신의 `pointerdown`에서 이 콜백을 호출해 드래그를
 * 시작시킨다.
 *
 * ⚠ 별도 모듈로 분리한 이유는 순환 방지: `DockLayout` → `NodeEditor` →
 * `DockPanelHeader` → 이 컨텍스트. 컨텍스트가 `DockLayout.tsx` 안에 있으면
 * `NodeEditor`가 `DockLayout`을 import하게 되어 순환이 생긴다
 * (`dockLeafContext.ts`의 동일한 사유 — B2-U1 선례를 그대로 따른다).
 *
 * 기본값은 **no-op**이다(`dockLeafContext`의 null-throw 관례와 다름) —
 * 프로바이더 없이 `DockPanelHeader`를 렌더하는 기존 단위 테스트들이 이
 * 컨텍스트를 몰라도 깨지지 않게 하기 위함이다. `DockLayout`이 항상
 * `<DockDragContext.Provider>`로 트리 전체를 감싸므로, 프로덕션 렌더
 * 경로에서는 이 기본값에 도달하지 않는다.
 */

import type { PointerEvent as ReactPointerEvent } from "react";
import { createContext, useContext } from "react";
import type { DockPanelId, DockPath } from "../state/dockTree";

export interface DockDragStart {
  /** leaf 헤더의 ⣿ grab handle에서 호출 — leaf의 모든 탭을 통째로 분리해
   * 드래그를 시작한다. */
  startLeafDrag: (path: DockPath, e: ReactPointerEvent) => void;
  /** 개별 탭에서 호출 — 그 탭 하나만 분리해 드래그를 시작한다. */
  startTabDrag: (id: DockPanelId, e: ReactPointerEvent) => void;
}

export const DockDragContext = createContext<DockDragStart>({
  startLeafDrag: () => {},
  startTabDrag: () => {},
});

export function useDockDragStart(): DockDragStart {
  return useContext(DockDragContext);
}

/**
 * 도킹 leaf 라우팅 컨텍스트 — B2-U1. `DockLayout`이 재귀 렌더링 중 각 leaf의
 * `{ leafId, path }`를 트리 위치에 실어 내려보내는 순수 라우팅 정보만 담는다.
 *
 * ⚠ leaf의 실제 데이터(collapsed/active 등)는 여기 담지 않는다 — 소비자
 * (`DockPanelHeader` 등)가 `useDockStore`를 `path` 기준으로 직접 구독해야
 * 정적 `<DockLeafContext.Provider>`로 감싼 테스트에서도 스토어 변경에 반응한다.
 *
 * 별도 모듈로 분리한 이유는 순환 방지: `DockLayout` → `NodeEditor` →
 * `DockPanelHeader` → 이 컨텍스트. 컨텍스트가 `DockLayout.tsx` 안에 있으면
 * `NodeEditor`가 `DockLayout`을 import하게 되어 순환이 생긴다.
 */

import { createContext, useContext } from "react";
import type { DockPath } from "../state/dockTree";

export interface DockLeafValue {
  leafId: string;
  path: DockPath;
}

export const DockLeafContext = createContext<DockLeafValue | null>(null);

export function useDockLeaf(): DockLeafValue {
  const v = useContext(DockLeafContext);
  if (v === null) {
    throw new Error(
      "useDockLeaf must be used inside DockLeafContext.Provider (DockLayout leaf)",
    );
  }
  return v;
}

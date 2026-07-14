import { create } from "zustand";
import type { PortType } from "../core/graph/types";

/** 드래그가 시작된 포트의 신원 — design/README.md §Interactions "노드 연결"의
 *  팬아웃 하이라이트(호환 입력 펄스 링 / 비호환 dim)를 계산하는 근거.
 *  node-connect.jsx L116-127의 grabbing/fanout 상태에 해당. */
export interface ConnectionDragSource {
  nodeId: string;
  handleId: string;
  side: "in" | "out";
  portType: PortType;
}

/** 마지막 연결 확정 지점(입력 포트)의 1회성 스냅 펄스. seq는 같은 포트에
 *  연속 연결해도 재생되도록 단조 증가. node-connect.jsx L303-309 snap ring.
 *  portDragMode.ts의 snapSeqFor가 이 형을 그대로 재사용한다(스토어가 단일
 *  출처). */
export interface SnapPulse {
  nodeId: string;
  handleId: string;
  seq: number;
}

interface ConnectionUiState {
  /** 진행 중인 포트 드래그. null이면 유휴. */
  dragging: ConnectionDragSource | null;
  snap: SnapPulse | null;
  startDrag: (d: ConnectionDragSource) => void;
  endDrag: () => void;
  triggerSnap: (nodeId: string, handleId: string) => void;
  clearSnap: () => void;
}

export const useConnectionUiStore = create<ConnectionUiState>((set) => ({
  dragging: null,
  snap: null,
  startDrag: (d) => set({ dragging: d }),
  endDrag: () => set({ dragging: null }),
  triggerSnap: (nodeId, handleId) =>
    set((s) => ({ snap: { nodeId, handleId, seq: (s.snap?.seq ?? 0) + 1 } })),
  clearSnap: () => set({ snap: null }),
}));

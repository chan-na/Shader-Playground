import type { PortSpec } from "../../core/nodes/registry";
import type {
  ConnectionDragSource,
  SnapPulse,
} from "../../state/connectionUiStore";

/** 드래그 중 포트의 시각 모드. node-connect.jsx의 상태 매핑:
 *  origin=L297(fresnelOut highlight while grabbing/dragging),
 *  compat=L298-299(bloomIn/outputIn fanout pulse), incompat=L300(mathIn dim). */
export type PortDragMode = "idle" | "origin" | "compat" | "incompat";

/**
 * Classifies a port's visual state for the duration of a connection drag.
 * `compat`/`incompat` only consider ports on the opposite side from the one
 * being dragged (design/node-connect.jsx L295-296: same-side ports like
 * `webcamOut` never dim/highlight during the fanout). Compatibility is the
 * same "exact type match" rule as NodeEditor/index.tsx's isValidConnection —
 * an input already occupied by another edge still reports `compat` here
 * (the drop itself is rejected by onConnect), matching that function's own
 * limitation.
 */
export function portDragMode(
  port: Pick<PortSpec, "name" | "type">,
  side: "in" | "out",
  nodeId: string | null,
  dragging: ConnectionDragSource | null,
): PortDragMode {
  if (!dragging) return "idle";
  if (
    nodeId === dragging.nodeId &&
    port.name === dragging.handleId &&
    side === dragging.side
  )
    return "origin";
  if (side === dragging.side) return "idle"; // 같은 방향은 후보 아님 (L295-296: webcamOut은 dim 안 됨)
  return port.type === dragging.portType ? "compat" : "incompat";
}

/** 이 포트에서 재생할 스냅 펄스의 seq. 0이면 재생 없음. 스냅은 항상 확정된
 *  엣지의 target(입력) 포트에서 난다 — onConnect가 conn을 정규화하므로 입력→
 *  출력 방향 드래그여도 동일. node-connect.jsx L303-309. */
export function snapSeqFor(
  snap: SnapPulse | null,
  nodeId: string | null,
  portName: string,
  side: "in" | "out",
): number {
  if (!snap || side !== "in") return 0;
  if (snap.nodeId !== nodeId || snap.handleId !== portName) return 0;
  return snap.seq;
}

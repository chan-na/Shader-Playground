import type { GraphEdge, GraphNode } from "../../core/graph/types";
import { nodeInputPorts, nodeOutputPorts } from "../../core/nodes/registry";
import { tokens } from "../../theme";
import { portFamilyHex } from "./nodeTheme";

/**
 * Edge stroke recipe handed to React Flow's `Edge.style` (a `CSSProperties`
 * subset — field names line up 1:1 so callers can spread the result
 * directly). design/README.md §Node Editor "엣지": 베지어 stroke 2.5, 색=소스
 * 포트 패밀리, 무효 상태는 빨강 점선.
 */
export interface EdgeVisualStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const ERROR_DASHARRAY = "5 5";

/**
 * Resolve an edge's visual style from the *current* graph nodes (so it stays
 * correct across re-renders as ports change, e.g. shader uniform edits).
 *
 * - Source node or its named output port can't be found → muted fallback
 *   (design/Node Editor.dc.html L344 레퍼런스의 "타입 정보 없음" 등가 상태).
 * - Target node/port missing, or its type doesn't match the source → the
 *   edge is invalid (most commonly a uniform deleted out from under a
 *   connected shader input) → semantic.error dashed.
 * - Otherwise the edge is valid → solid line in the source port's family
 *   color.
 */
export function edgeStyleFor(
  edge: GraphEdge,
  nodes: GraphNode[],
): EdgeVisualStyle {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const sourcePort = sourceNode
    ? nodeOutputPorts(sourceNode).find((p) => p.name === edge.sourceHandle)
    : undefined;
  if (!sourceNode || !sourcePort) {
    return { stroke: tokens.text.muted, strokeWidth: 2.5 };
  }

  const targetNode = nodes.find((n) => n.id === edge.target);
  const targetPort = targetNode
    ? nodeInputPorts(targetNode).find((p) => p.name === edge.targetHandle)
    : undefined;
  if (!targetNode || !targetPort || targetPort.type !== sourcePort.type) {
    return {
      stroke: tokens.semantic.error,
      strokeWidth: 2.5,
      strokeDasharray: ERROR_DASHARRAY,
    };
  }

  return { stroke: portFamilyHex(sourcePort.type), strokeWidth: 2.5 };
}

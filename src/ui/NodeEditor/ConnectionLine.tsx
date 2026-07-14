import {
  type ConnectionLineComponentProps,
  getBezierPath,
} from "@xyflow/react";
import { nodeInputPorts, nodeOutputPorts } from "../../core/nodes/registry";
import { useGraphStore } from "../../state/graphStore";
import { tokens } from "../../theme";
import { portFamilyHex } from "./nodeTheme";

/**
 * Live bezier line drawn while a port drag is in progress (design/Node
 * Editor.dc.html L64 "DRAG IN PROGRESS" reference + L19 `neDash` keyframes,
 * ported as `sp-edge-dash` in nodeCard.css). Colored by the family of the
 * handle the drag started from, dashed, and always animated — the one
 * exception to the "no idle animation" rule since it only mounts while a
 * connection is actively being dragged.
 */
export function ConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  fromNode,
  fromHandle,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <path
      d={path}
      fill="none"
      stroke={strokeForHandle(fromNode.id, fromHandle)}
      strokeWidth={2.5}
      strokeDasharray="6 6"
      className="sp-connection-line"
    />
  );
}

/**
 * Family color of the port a drag started from. Looked up against the
 * graph store (not `fromNode.data`, which is React Flow's internal node and
 * would need an unsafe cast to recover the `GraphNode` payload) so the drag
 * always reflects the live port list even if it changed since the last
 * render.
 */
function strokeForHandle(
  fromNodeId: string,
  fromHandle: ConnectionLineComponentProps["fromHandle"],
): string {
  const node = useGraphStore.getState().nodes.find((n) => n.id === fromNodeId);
  if (!node || !fromHandle.id) return tokens.accent.default;

  const ports =
    fromHandle.type === "source" ? nodeOutputPorts(node) : nodeInputPorts(node);
  const port = ports.find((p) => p.name === fromHandle.id);
  return port ? portFamilyHex(port.type) : tokens.accent.default;
}

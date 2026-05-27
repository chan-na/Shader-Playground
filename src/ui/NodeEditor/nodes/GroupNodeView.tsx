import { type NodeProps, NodeResizer } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { GroupGraphNode } from "../../../core/graph/types";
import { useGraphStore } from "../../../state/graphStore";

const DEFAULT_TINT = "#5b6a7a";

/**
 * Pure visual container — no GLSL, no ports. Children draw on top because
 * React Flow renders them with a higher z-index when `parentId` is set.
 * Resize handles update the node size in-place (no history push), matching
 * how plain node drags work.
 */
export function GroupNodeView({ id, data, selected }: NodeProps) {
  const node = data.node as GroupGraphNode;
  const setGroupSize = useGraphStore((s) => s.setGroupSize);
  // Buffer for the latest resize event so we can apply it on commit instead
  // of every pixel. Keeps history clean and renders snappy without thrashing
  // the rev when the user is mid-drag.
  const pendingRef = useRef<{ width: number; height: number } | null>(null);

  // Apply latest committed resize to the store. NodeResizer fires onResizeEnd
  // when the mouse releases; that's the moment to write back.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        setGroupSize(id, pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [id, setGroupSize]);

  const tint = node.color ?? DEFAULT_TINT;

  return (
    <div
      className="node-card node-card--group"
      data-testid="group-node"
      data-group-id={id}
      style={{
        width: node.width,
        height: node.height,
        background: `${tint}1f`, // ~12% alpha hex appended
        border: `1px solid ${selected ? tint : `${tint}80`}`,
        borderRadius: 6,
        position: "relative",
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      <NodeResizer
        color={tint}
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        onResize={(_, params) => {
          pendingRef.current = { width: params.width, height: params.height };
        }}
        onResizeEnd={(_, params) => {
          setGroupSize(id, { width: params.width, height: params.height });
          pendingRef.current = null;
        }}
      />
      <div
        className="node-card__header node-card__header--group"
        data-testid="group-label"
        style={{
          background: `${tint}55`,
          color: "#eee",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottom: `1px solid ${tint}80`,
          // Group header is the only click target — children draw above the
          // body, so clicks elsewhere fall through to them.
        }}
      >
        {node.label}
      </div>
    </div>
  );
}

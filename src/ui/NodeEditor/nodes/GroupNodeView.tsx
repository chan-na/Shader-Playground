import { type NodeProps, NodeResizer } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { directChildren } from "../../../core/graph/parents";
import type { GroupGraphNode } from "../../../core/graph/types";
import { GROUP_COLLAPSED_HEIGHT } from "../../../core/graph/types";
import { useGraphStore } from "../../../state/graphStore";

const DEFAULT_TINT = "#5b6a7a";

/**
 * Pure visual container — no GLSL, no ports. Children draw on top because
 * React Flow renders them with a higher z-index when `parentId` is set.
 * Resize handles update the node size in-place (no history push), matching
 * how plain node drags work. The header carries a collapse toggle and
 * double-click-to-rename; collapsing hides every descendant (handled in
 * NodeEditor via `hasCollapsedAncestor`) and shrinks the card to the header.
 */
export function GroupNodeView({ id, data, selected }: NodeProps) {
  const node = data.node as GroupGraphNode;
  const setGroupSize = useGraphStore((s) => s.setGroupSize);
  const setGroupLabel = useGraphStore((s) => s.setGroupLabel);
  const toggleGroupCollapsed = useGraphStore((s) => s.toggleGroupCollapsed);
  const childCount = useGraphStore(
    (s) => directChildren(id, s.nodes, s.parents).length,
  );
  // Buffer for the latest resize event so we can apply it on commit instead
  // of every pixel. Keeps history clean and renders snappy without thrashing
  // the rev when the user is mid-drag.
  const pendingRef = useRef<{ width: number; height: number } | null>(null);
  // React Flow's drag handler swallows the native dblclick on node content, so
  // we detect a double-click ourselves from two rapid clicks on the label.
  const lastClickRef = useRef(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label);

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

  const collapsed = node.collapsed ?? false;
  const tint = node.color ?? DEFAULT_TINT;

  const commitLabel = () => {
    const next = draft.trim();
    if (next.length > 0 && next !== node.label) setGroupLabel(id, next);
    setEditing(false);
  };

  return (
    <div
      className="node-card node-card--group"
      data-testid="group-node"
      data-group-id={id}
      data-collapsed={collapsed}
      style={{
        width: node.width,
        height: collapsed ? GROUP_COLLAPSED_HEIGHT : node.height,
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
        isVisible={selected && !collapsed}
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
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: `${tint}55`,
          color: "#eee",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottom: collapsed ? "none" : `1px solid ${tint}80`,
          // Group header is the only click target — children draw above the
          // body, so clicks elsewhere fall through to them.
        }}
      >
        <button
          type="button"
          className="nodrag"
          data-testid="group-collapse-toggle"
          aria-label={collapsed ? "Expand group" : "Collapse group"}
          aria-expanded={!collapsed}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleGroupCollapsed(id);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            padding: 0,
            background: "transparent",
            border: "none",
            color: "#eee",
            cursor: "pointer",
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        {editing ? (
          <input
            type="text"
            className="nodrag"
            data-testid="group-label-inline-input"
            value={draft}
            maxLength={256}
            // biome-ignore lint/a11y/noAutofocus: inline rename should focus immediately on double-click
            autoFocus
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLabel();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "1px 4px",
              fontSize: 12,
              fontWeight: 600,
              background: "#1a1a1a",
              color: "#ddd",
              border: "1px solid #444",
              borderRadius: 3,
            }}
          />
        ) : (
          // A button keeps the rename trigger keyboard-accessible (Enter/Space
          // start editing). `nodrag` lets the click reach us — React Flow's drag
          // handler otherwise swallows pointer interactions on node content.
          <button
            type="button"
            className="nodrag"
            data-testid="group-label-text"
            title="Double-click to rename"
            onClick={(e) => {
              e.stopPropagation();
              const now = Date.now();
              if (now - lastClickRef.current < 350) {
                lastClickRef.current = 0;
                setDraft(node.label);
                setEditing(true);
              } else {
                lastClickRef.current = now;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setDraft(node.label);
                setEditing(true);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: "transparent",
              border: "none",
              color: "inherit",
              font: "inherit",
              padding: 0,
              cursor: "text",
            }}
          >
            {node.label}
            {collapsed && childCount > 0 && (
              <span style={{ marginLeft: 6, color: "#bbb", fontWeight: 400 }}>
                ({childCount})
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

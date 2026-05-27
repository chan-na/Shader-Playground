import { useState } from "react";
import { directChildren } from "../../core/graph/parents";
import type { GroupGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";

const DEFAULT_TINT = "#5b6a7a";

/**
 * Editor pane for a group node. Surfaces label/color editing and the two
 * destructive removal modes (release vs. cascade). Per-node delete via
 * Backspace bypasses this panel and uses `removeNode`, which already orphans
 * direct children without cascading.
 */
export function GroupInspector({ node }: { node: GroupGraphNode }) {
  const setGroupLabel = useGraphStore((s) => s.setGroupLabel);
  const setGroupColor = useGraphStore((s) => s.setGroupColor);
  const removeGroup = useGraphStore((s) => s.removeGroup);
  const select = useSelectionStore((s) => s.select);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const childCount = useGraphStore(
    (s) => directChildren(node.id, s.nodes, s.parents).length,
  );

  return (
    <div
      className="inspector-section"
      data-testid="group-inspector"
      data-group-id={node.id}
    >
      <div className="inspector-label">Group</div>

      <label
        style={{ color: "#aaa", fontSize: 11, display: "block", marginTop: 4 }}
      >
        Label
        <input
          type="text"
          value={node.label}
          onChange={(e) => setGroupLabel(node.id, e.target.value)}
          maxLength={256}
          data-testid="group-label-input"
          style={{
            width: "100%",
            marginTop: 4,
            padding: "4px 8px",
            fontSize: 12,
            background: "#1a1a1a",
            color: "#ddd",
            border: "1px solid #333",
            borderRadius: 3,
            boxSizing: "border-box",
          }}
        />
      </label>

      <label
        style={{
          color: "#aaa",
          fontSize: 11,
          display: "block",
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        Tint
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <input
            type="color"
            value={node.color ?? DEFAULT_TINT}
            onChange={(e) => setGroupColor(node.id, e.target.value)}
            data-testid="group-color-input"
            style={{
              width: 36,
              height: 24,
              border: "1px solid #333",
              borderRadius: 3,
              background: "#1a1a1a",
              padding: 0,
            }}
          />
          {node.color !== undefined && (
            <button
              type="button"
              onClick={() => setGroupColor(node.id, undefined)}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                background: "transparent",
                color: "#888",
                border: "1px solid #333",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </label>

      <div style={{ color: "#777", fontSize: 11, marginBottom: 8 }}>
        {childCount === 0
          ? "No children. Drag nodes onto the group to assign."
          : `${childCount} direct child${childCount === 1 ? "" : "ren"}`}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            removeGroup(node.id, "release-children");
            select(null);
          }}
          data-testid="group-ungroup"
          style={{
            flex: 1,
            padding: "6px 10px",
            background: "transparent",
            color: "#cfc",
            border: "1px solid #344",
            borderRadius: 3,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Ungroup (keep children)
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          data-testid="group-delete-cascade"
          style={{
            flex: 1,
            padding: "6px 10px",
            background: "transparent",
            color: "#fbb",
            border: "1px solid #533",
            borderRadius: 3,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Delete with children…
        </button>
      </div>

      {confirmingDelete && (
        <div
          data-testid="group-delete-confirm"
          style={{
            marginTop: 10,
            padding: 8,
            background: "#2a1f1f",
            border: "1px solid #533",
            borderRadius: 3,
            color: "#fdd",
            fontSize: 12,
          }}
        >
          Permanently remove this group and{" "}
          {childCount === 1
            ? "its 1 child"
            : `its ${childCount} direct children`}
          ? Nested groups and edges are also deleted.
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                removeGroup(node.id, "delete-children");
                select(null);
                setConfirmingDelete(false);
              }}
              data-testid="group-delete-confirm-ok"
              style={{
                flex: 1,
                padding: "4px 8px",
                background: "#5c2a2a",
                color: "#fee",
                border: "1px solid #844",
                borderRadius: 3,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Delete all
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              style={{
                flex: 1,
                padding: "4px 8px",
                background: "transparent",
                color: "#aaa",
                border: "1px solid #444",
                borderRadius: 3,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

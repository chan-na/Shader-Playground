import { useState } from "react";
import { directChildren } from "../../core/graph/parents";
import type { GroupGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";

// Matches GroupNodeView.tsx's own DEFAULT_TINT (the node card's fallback
// swatch when `node.color` is unset) so the Inspector and the graph card
// never disagree on what an untinted group looks like.
const DEFAULT_TINT = tokens.nodeCategory.container;

/**
 * Editor pane for a group node. Surfaces color editing and the two destructive
 * removal modes (release vs. cascade); renaming lives in the Inspector's common
 * Name field [A-2]. Per-node delete via Backspace bypasses this panel and uses
 * `removeNode`, which already orphans direct children without cascading.
 */
export function GroupInspector({ node }: { node: GroupGraphNode }) {
  const setGroupColor = useGraphStore((s) => s.setGroupColor);
  const removeGroup = useGraphStore((s) => s.removeGroup);
  const select = useSelectionStore((s) => s.select);
  // [#25] Which group the confirm box is armed for — not a bare boolean.
  // The Inspector renders this panel unkeyed, so selecting a different group
  // reuses the same component instance and a boolean would carry the armed
  // state over: the new group's panel would open already showing "Permanently
  // remove this group and its N children?", one stray click from a cascade
  // delete the user never asked for.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const childCount = useGraphStore(
    (s) => directChildren(node.id, s.nodes, s.parents).length,
  );

  const tint = node.color ?? DEFAULT_TINT;

  return (
    <div
      className="inspector-section"
      data-testid="group-inspector"
      data-group-id={node.id}
    >
      <div className="inspector-label">Group</div>

      {/* [A-2] No Group label field — the common Name field (Inspector.tsx)
          renames groups too, routing into `label` via renameNode. */}

      <div style={{ marginBottom: 15 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Tint
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            className="ctl-color-swatch"
            style={{ width: 26, height: 26, background: tint }}
          >
            <input
              type="color"
              className="ctl-color-input"
              value={tint}
              aria-label="Group tint"
              data-testid="group-color-input"
              onChange={(e) => setGroupColor(node.id, e.target.value)}
            />
          </span>
          {node.color !== undefined && (
            <button
              type="button"
              className="ctl-btn ctl-btn--ghost"
              onClick={() => setGroupColor(node.id, undefined)}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div
        style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 8 }}
      >
        {childCount === 0
          ? "No children. Drag nodes onto the group to assign."
          : `${childCount} direct child${childCount === 1 ? "" : "ren"}`}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="ctl-btn ctl-btn--secondary"
          style={{ flex: 1 }}
          onClick={() => {
            removeGroup(node.id, "release-children");
            select(null);
          }}
          data-testid="group-ungroup"
        >
          Ungroup (keep children)
        </button>
        <button
          type="button"
          className="ctl-btn ctl-btn--danger"
          style={{ flex: 1 }}
          onClick={() => setConfirmingId(node.id)}
          data-testid="group-delete-cascade"
        >
          Delete with children…
        </button>
      </div>

      {confirmingId === node.id && (
        <div
          data-testid="group-delete-confirm"
          style={{
            marginTop: 10,
            padding: 8,
            background: withAlpha(tokens.semantic.error, 0.08),
            border: `1px solid ${withAlpha(tokens.semantic.error, 0.25)}`,
            borderRadius: tokens.radius.button,
            color: "var(--text-primary)",
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
              className="ctl-btn"
              style={{
                flex: 1,
                background: withAlpha(tokens.semantic.error, 0.25),
                border: `1px solid ${withAlpha(tokens.semantic.error, 0.4)}`,
                color: "var(--text-primary)",
              }}
              onClick={() => {
                removeGroup(node.id, "delete-children");
                select(null);
                setConfirmingId(null);
              }}
              data-testid="group-delete-confirm-ok"
            >
              Delete all
            </button>
            <button
              type="button"
              className="ctl-btn ctl-btn--ghost"
              style={{ flex: 1 }}
              onClick={() => setConfirmingId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

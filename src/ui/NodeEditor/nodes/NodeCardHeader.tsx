import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { GraphNodeKind } from "../../../core/graph/types";
import { useGraphStore } from "../../../state/graphStore";
import { tokens, withAlpha } from "../../../theme";
import { categoryHexFor, NODE_GLYPH } from "../nodeTheme";

export interface NodeCardHeaderProps {
  kind: GraphNodeKind;
  title: string;
  meta?: ReactNode;
  /**
   * When "error", the header gradient switches from the node's category
   * color to semantic.error — design/Node Editor.dc.html L198 (Blend, ERROR
   * state): `rgba(240,85,92,0.26) → rgba(240,85,92,0.1)`. The icon box glyph
   * stays the category color (unaffected — see L199, still the process blue
   * diamond) since the tint communicates "this instance is broken", not "the
   * node kind changed".
   */
  tone?: "error";
  /**
   * Enables double-click-to-rename on the title (D15,
   * design/Node Editor.dc.html L387-394) when present. Omitted for callers
   * that don't have a stable node id (there are none left after V1-2, but
   * the prop stays optional so the plain-title rendering path — and its
   * existing tests — keep working unchanged).
   */
  nodeId?: string;
}

/**
 * Standard node card header: category-gradient bar + icon box (glyph) +
 * title + right-aligned meta slot. Design source: design/Node Editor.dc.html
 * L73-76 (standard header, e.g. Mesh) — the selected/"hero" header (L182-185)
 * uses the same shape with a brighter gradient driven by the selection ring,
 * which the card's `.selected` box-shadow already conveys separately.
 */
export function NodeCardHeader({
  kind,
  title,
  meta,
  tone,
  nodeId,
}: NodeCardHeaderProps) {
  // Hooks always run (useHookAtTopLevel) regardless of whether `nodeId` is
  // present — only the JSX branch below decides whether rename is reachable.
  const renameNode = useGraphStore((s) => s.renameNode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // React Flow's drag handler swallows the native dblclick on node content
  // (same issue GroupNodeView's label works around), so a second click
  // within 350ms of the first is treated as the "double-click".
  const lastClickRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const cat = categoryHexFor(kind);
  // Error tone swaps both the gradient hex (category → semantic.error) and
  // its stop alphas (0.22/0.08 → 0.26/0.1) to match the Blend/ERROR header
  // exactly — design/Node Editor.dc.html L198 vs. the standard L73 header.
  const [gradientHex, stopA, stopB] =
    tone === "error"
      ? ([tokens.semantic.error, 0.26, 0.1] as const)
      : ([cat, 0.22, 0.08] as const);
  return (
    <div
      className="node-card__header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 11px",
        borderBottom: "1px solid var(--border-node)",
        background: `linear-gradient(180deg, ${withAlpha(gradientHex, stopA)}, ${withAlpha(gradientHex, stopB)})`,
        borderRadius: "10px 10px 0 0",
      }}
    >
      <div
        style={{
          width: 15,
          height: 15,
          flexShrink: 0,
          borderRadius: tokens.radius.iconBox,
          background: withAlpha(cat, 0.2),
          border: `1px solid ${cat}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: cat,
        }}
      >
        {NODE_GLYPH[kind]}
      </div>
      {nodeId === undefined ? (
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
      ) : editing ? (
        <input
          ref={inputRef}
          type="text"
          className="nodrag"
          data-testid="node-title-input"
          value={draft}
          maxLength={256}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            renameNode(nodeId, draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              renameNode(nodeId, draft);
              setEditing(false);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          style={{
            background: "var(--surface-app)",
            border: "1px solid var(--accent-default)",
            borderRadius: tokens.radius.iconBox,
            padding: "2px 6px",
            boxShadow: `0 0 0 2px ${withAlpha(tokens.accent.default, 0.22)}`,
            fontSize: 11.5,
            fontWeight: 600,
            // dc L393: the edit box is pure white — text.emphasis exists to
            // mark the "being edited" state apart from the text.primary header
            // title [B-2].
            color: "var(--text-emphasis)",
            width: "100%",
            minWidth: 0,
          }}
        />
      ) : (
        // A button keeps the rename trigger keyboard-accessible (Enter/Space
        // start editing) and `nodrag` lets the click reach us — React Flow's
        // drag handler otherwise swallows pointer interactions on node
        // content. The dc's blinking caret span (L393) is dropped in favor
        // of the input's own native caret once editing starts.
        <button
          type="button"
          className="nodrag"
          data-testid="node-title-text"
          title="Double-click to rename"
          onClick={(e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastClickRef.current < 350) {
              lastClickRef.current = 0;
              setDraft(title);
              setEditing(true);
            } else {
              lastClickRef.current = now;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setDraft(title);
              setEditing(true);
            }
          }}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            background: "transparent",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: "text",
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </button>
      )}
      {meta === undefined ? null : (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            // Lets a fragment of multiple meta children (e.g. ShaderNodeView's
            // FullscreenBadge + ErrorBadge/GpuTimerChip pair, A-1) sit apart
            // without touching — a no-op for every other caller's single
            // ReactNode meta.
            gap: 5,
          }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}

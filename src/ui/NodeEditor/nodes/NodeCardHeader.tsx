import type { ReactNode } from "react";
import type { GraphNodeKind } from "../../../core/graph/types";
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
}: NodeCardHeaderProps) {
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
      {meta === undefined ? null : (
        <div
          style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}

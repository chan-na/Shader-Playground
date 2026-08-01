import { useMemo } from "react";
import { attrTypeLabel, meshContractFor } from "../../core/assets/meshContract";
import type { MeshGraphNode } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";

/** Same chip visual as the Compute section's count/primitive chips
 *  (Inspector.tsx's pre-extraction "Compute" block) — reused verbatim rather
 *  than introducing a second chip style. */
const chipStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-secondary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-icon-box)",
  padding: "2px 7px",
} as const;

export interface MeshInspectorSectionProps {
  node: MeshGraphNode;
}

/**
 * [B-1] Mesh node Inspector section — the mesh-side counterpart to the
 * existing Compute "Attributes" block (chips + mono attribute rows), so the
 * `mesh` port's fixed a_position/a_normal/a_uv contract is no longer only
 * visible on the node card.
 */
export function MeshInspectorSection({ node }: MeshInspectorSectionProps) {
  const asset = useAssetStore((s) =>
    node.assetId ? s.meshes[node.assetId] : undefined,
  );
  const contract = useMemo(() => meshContractFor(node, asset), [node, asset]);

  return (
    <div className="inspector-section" data-testid="mesh-attributes">
      <div className="inspector-label">Mesh</div>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <span style={chipStyle}>
          {contract.vertexCount.toLocaleString()} verts
        </span>
        <span style={chipStyle}>
          {contract.indexCount.toLocaleString()} idx
        </span>
        <span style={chipStyle}>{contract.primitiveLabel}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="inspector-label" style={{ fontSize: 11 }}>
          Attributes
        </div>
        {contract.attributes.map((a) => (
          <div
            key={a.name}
            style={{
              color: "var(--text-bright-body)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {a.name}{" "}
            <span style={{ color: "var(--text-muted)" }}>
              ({attrTypeLabel(a.size)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

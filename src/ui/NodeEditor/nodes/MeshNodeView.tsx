import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import {
  attrTypeLabel,
  meshContractFor,
} from "../../../core/assets/meshContract";
import {
  PRIMITIVE_NAMES,
  type PrimitiveName,
} from "../../../core/assets/primitives";
import { aggregateMeshConsumption } from "../../../core/graph/meshConsumption";
import type { MeshGraphNode } from "../../../core/graph/types";
import { displayNodeName } from "../../../core/nodes/registry";
import { useAssetStore } from "../../../state/assetStore";
import { useGraphStore } from "../../../state/graphStore";
import { usePassPlanStore } from "../../../state/passPlanStore";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function MeshNodeView({ id, data }: NodeProps) {
  const node = data.node as MeshGraphNode;
  // Targeted action rather than a whole-graph `setGraph`: the latter resets
  // the parent map, so picking a primitive used to dissolve every group.
  const setMeshPrimitive = useGraphStore((s) => s.setMeshPrimitive);
  const asset = useAssetStore((s) =>
    node.assetId ? s.meshes[node.assetId] : undefined,
  );
  const edges = useGraphStore((s) => s.edges);
  const passRows = usePassPlanStore((s) => s.rows);

  const setPrimitive = (p: PrimitiveName) => {
    setMeshPrimitive(id, p);
  };

  const usingAsset = !!asset;
  const label = usingAsset ? asset?.name : node.primitive;

  // [B-1] The mesh port's actual attribute contract — computed from the same
  // sources the render path reads (asset.data, or makePrimitive for a
  // built-in), never inferred. Memoized: makePrimitive regenerates full
  // vertex buffers on every call.
  const contract = useMemo(() => meshContractFor(node, asset), [node, asset]);
  const attrSummary = contract.attributes
    .map((a) => `${a.name} ${attrTypeLabel(a.size)}`)
    .join(" · ");

  // [B-2] Attributes this mesh provides but that no connected consumer's
  // linked program actually bound (core/gl/mesh.ts's quiet skip, made
  // visible). Aggregated across every shader pass wired to this mesh's
  // output port — "any consumer" semantics, see aggregateMeshConsumption.
  const skippedAttrNames = useMemo(() => {
    const consumers = new Set(
      edges
        .filter((e) => e.source === id && e.targetHandle === "mesh")
        .map((e) => e.target),
    );
    const consumerUses: Array<
      ReadonlyArray<{ name: string; consumed: boolean }>
    > = [];
    for (const row of passRows) {
      if (row.kind === "shader" && consumers.has(row.nodeId)) {
        consumerUses.push(row.meshAttributeUse);
      }
    }
    const statuses = aggregateMeshConsumption(
      contract.attributes,
      consumerUses,
    );
    return contract.attributes
      .filter((a) => statuses[a.name] === "skipped")
      .map((a) => a.name);
  }, [edges, passRows, id, contract]);

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 168 }}>
      <NodeCardHeader
        kind="mesh"
        title={displayNodeName(node)}
        nodeId={id}
        meta={<span className="node-card__meta">{label}</span>}
      />
      <div
        className="node-card__body"
        style={{ paddingLeft: 14, paddingRight: 22 }}
      >
        {usingAsset ? null : (
          <select
            className="node-card__select nodrag"
            value={node.primitive}
            onChange={(e) => setPrimitive(e.target.value as PrimitiveName)}
          >
            {PRIMITIVE_NAMES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <div
          className="node-card__meta"
          style={{ fontSize: 10, marginTop: usingAsset ? 0 : 4 }}
          data-testid="mesh-contract"
        >
          <div>{attrSummary}</div>
          <div>
            {contract.vertexCount.toLocaleString()} verts ·{" "}
            {contract.indexCount.toLocaleString()} idx ·{" "}
            {contract.primitiveLabel}
          </div>
          {skippedAttrNames.length > 0 && (
            <div
              style={{ color: "var(--warning)" }}
              data-testid="mesh-skipped-attrs"
            >
              {skippedAttrNames.join(", ")} — vertex가 사용하지 않음(스킵됨)
            </div>
          )}
        </div>
      </div>
      <PortHandle
        port={{ name: "mesh", type: "mesh" }}
        side="out"
        top={PORT_TOP_PAD}
        tooltip={`mesh: ${attrSummary} · ${contract.vertexCount.toLocaleString()} verts`}
      />
    </div>
  );
}

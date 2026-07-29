import type { NodeProps } from "@xyflow/react";
import {
  PRIMITIVE_NAMES,
  type PrimitiveName,
} from "../../../core/assets/primitives";
import type { MeshGraphNode } from "../../../core/graph/types";
import { displayNodeName } from "../../../core/nodes/registry";
import { useAssetStore } from "../../../state/assetStore";
import { useGraphStore } from "../../../state/graphStore";
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

  const setPrimitive = (p: PrimitiveName) => {
    setMeshPrimitive(id, p);
  };

  const usingAsset = !!asset;
  const label = usingAsset ? asset?.name : node.primitive;

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
        {usingAsset ? (
          <div className="node-card__meta" style={{ fontSize: 10 }}>
            {asset?.data.vertexCount.toLocaleString()} verts
          </div>
        ) : (
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
      </div>
      <PortHandle
        port={{ name: "mesh", type: "mesh" }}
        side="out"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}

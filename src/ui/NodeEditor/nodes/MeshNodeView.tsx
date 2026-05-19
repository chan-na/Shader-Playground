import type { NodeProps } from "@xyflow/react";
import {
  PRIMITIVE_NAMES,
  type PrimitiveName,
} from "../../../core/assets/primitives";
import type { MeshGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { useGraphStore } from "../../../state/graphStore";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

export function MeshNodeView({ id, data }: NodeProps) {
  const node = data.node as MeshGraphNode;
  const setGraph = useGraphStore((s) => s.setGraph);
  const asset = useAssetStore((s) =>
    node.assetId ? s.meshes[node.assetId] : undefined,
  );

  const setPrimitive = (p: PrimitiveName) => {
    const s = useGraphStore.getState();
    setGraph({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? ({ ...n, primitive: p, assetId: null } as MeshGraphNode)
          : n,
      ),
      edges: s.edges,
    });
  };

  const usingAsset = !!asset;
  const label = usingAsset ? asset?.name : node.primitive;

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 168 }}>
      <div className="node-card__header node-card__header--mesh">
        Mesh · {label}
      </div>
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

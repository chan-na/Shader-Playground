import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { ImageGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { tokens } from "../../../theme";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const THUMB_SIZE = 96;

export function ImageNodeView({ id, data }: NodeProps) {
  const node = data.node as ImageGraphNode;
  const asset = useAssetStore((s) =>
    node.assetId ? s.images[node.assetId] : undefined,
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (asset?.bitmap) {
      ctx.drawImage(asset.bitmap, 0, 0, canvas.width, canvas.height);
    }
  }, [asset?.bitmap]);

  return (
    <div className="node-card" style={{ position: "relative" }}>
      <NodeCardHeader
        kind="image"
        title="Image"
        meta={
          asset ? (
            <span className="node-card__meta">{truncate(asset.name, 14)}</span>
          ) : undefined
        }
      />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {asset?.bitmap ? (
          <canvas
            ref={canvasRef}
            width={THUMB_SIZE}
            height={THUMB_SIZE}
            style={{
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              display: "block",
              imageRendering: "pixelated",
              borderRadius: tokens.radius.input,
              background: "var(--surface-app)",
              border: "1px solid var(--border-node)",
              boxShadow: "var(--shadow-thumbnail-inset)",
            }}
          />
        ) : (
          <div className="node-card__placeholder">No image</div>
        )}
        <div className="node-card__meta">
          {asset ? `${asset.width}×${asset.height}` : id}
        </div>
      </div>
      <PortHandle
        port={{ name: "texture", type: "texture" }}
        side="out"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

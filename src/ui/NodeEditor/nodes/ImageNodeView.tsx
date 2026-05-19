import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { ImageGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const THUMB_W = 96;
const THUMB_H = 64;

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
      <div className="node-card__header node-card__header--image">
        Image{asset ? ` · ${truncate(asset.name, 14)}` : ""}
      </div>
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {asset?.bitmap ? (
          <canvas
            ref={canvasRef}
            width={THUMB_W}
            height={THUMB_H}
            style={{
              width: THUMB_W,
              height: THUMB_H,
              display: "block",
              imageRendering: "pixelated",
              borderRadius: 3,
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

import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import {
  getExternalStatus,
  getExternalVideoElement,
} from "../../../core/external/registry";
import type { VideoGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const PREVIEW_W = 96;
const PREVIEW_H = 64;
const POLL_MS = 200;

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
}

export function VideoNodeView({ id, data }: NodeProps) {
  const node = data.node as VideoGraphNode;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>({
    ready: false,
    error: null,
    width: 0,
    height: 0,
  });
  const assetName = useAssetStore((s) =>
    node.assetId ? (s.videos[node.assetId]?.name ?? null) : null,
  );

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const s = getExternalStatus(id);
      if (s) setStatus({ ...s });
      const src = getExternalVideoElement(id);
      const v = videoRef.current;
      if (v && src?.currentSrc && v.src !== src.currentSrc) {
        v.src = src.currentSrc;
        v.muted = true;
        v.loop = node.loop;
        v.playsInline = true;
        if (node.playing) v.play().catch(() => {});
      }
      if (v && !node.playing && !v.paused) v.pause();
      if (v && node.playing && v.paused && v.readyState >= 2) {
        v.play().catch(() => {});
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [id, node.playing, node.loop]);

  return (
    <div
      className="node-card"
      data-testid="video-node"
      style={{ position: "relative" }}
    >
      <div className="node-card__header node-card__header--video">Video</div>
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {!node.assetId ? (
          <div className="node-card__placeholder">no asset</div>
        ) : status.error ? (
          <div className="node-card__placeholder" title={status.error}>
            error
          </div>
        ) : (
          <video
            ref={videoRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            muted
            playsInline
            style={{
              width: PREVIEW_W,
              height: PREVIEW_H,
              display: "block",
              objectFit: "cover",
              background: "#000",
              borderRadius: 3,
              opacity: status.ready ? 1 : 0.4,
            }}
          />
        )}
        <div className="node-card__meta">
          {status.ready && status.width && status.height
            ? `${status.width}×${status.height}`
            : status.error
              ? "load failed"
              : (assetName ?? "no asset")}
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

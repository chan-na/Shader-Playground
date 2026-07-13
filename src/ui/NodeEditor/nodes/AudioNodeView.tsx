import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import {
  getExternalAudioBins,
  getExternalStatus,
} from "../../../core/external/registry";
import type { AudioGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const PREVIEW_W = 96;
const PREVIEW_H = 48;
const POLL_MS = 100;

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
}

export function AudioNodeView({ id, data }: NodeProps) {
  const node = data.node as AudioGraphNode;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>({
    ready: false,
    error: null,
  });
  const assetName = useAssetStore((s) =>
    node.assetId ? (s.audios[node.assetId]?.name ?? null) : null,
  );

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const s = getExternalStatus(id);
      if (s) setStatus({ ready: s.ready, error: s.error });
      drawSpectrum(canvasRef.current, getExternalAudioBins(id));
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [id]);

  const sourceLabel =
    node.sourceKind === "mic" ? "microphone" : (assetName ?? "no asset");

  return (
    <div
      className="node-card"
      data-testid="audio-node"
      style={{ position: "relative" }}
    >
      <NodeCardHeader kind="audio" title="Audio" />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {node.sourceKind === "file" && !node.assetId ? (
          <div className="node-card__placeholder">no asset</div>
        ) : status.error ? (
          <div className="node-card__placeholder" title={status.error}>
            error
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            style={{
              width: PREVIEW_W,
              height: PREVIEW_H,
              display: "block",
              background: "#000",
              borderRadius: 3,
              opacity: status.ready ? 1 : 0.4,
            }}
          />
        )}
        <div className="node-card__meta">
          {status.ready
            ? `${node.fftSize / 2} bins`
            : status.error
              ? "load failed"
              : sourceLabel}
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

function drawSpectrum(
  canvas: HTMLCanvasElement | null,
  bins: Uint8Array | null,
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!bins?.length) return;
  ctx.fillStyle = "#56c1d6";
  const barWidth = Math.max(1, w / bins.length);
  for (let i = 0; i < bins.length; i++) {
    const raw = bins[i] ?? 0;
    const v = raw / 255;
    const bh = v * h;
    ctx.fillRect(i * barWidth, h - bh, barWidth, bh);
  }
}

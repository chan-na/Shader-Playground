import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type { ExternalStatusKind } from "../../../core/external/registry";
import {
  getExternalAudioBins,
  getExternalStatus,
} from "../../../core/external/registry";
import type { AudioGraphNode } from "../../../core/graph/types";
import { useAssetStore } from "../../../state/assetStore";
import { BlockedBadge } from "./BlockedBadge";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const PREVIEW_W = 96;
const PREVIEW_H = 48;
const POLL_MS = 100;

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  statusKind: ExternalStatusKind;
}

export function AudioNodeView({ id, data }: NodeProps) {
  const node = data.node as AudioGraphNode;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>({
    ready: false,
    error: null,
    statusKind: "pending",
  });
  const assetName = useAssetStore((s) =>
    node.assetId ? (s.audios[node.assetId]?.name ?? null) : null,
  );
  // File mode never goes through a permission prompt, so its "not ready yet"
  // window (decoding) is never treated as the blocked skin — only mic mode's
  // pending/denied getUserMedia outcomes are.
  const isBlocked =
    node.sourceKind === "mic" &&
    (status.statusKind === "pending" || status.statusKind === "denied");

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const s = getExternalStatus(id);
      if (s)
        setStatus({ ready: s.ready, error: s.error, statusKind: s.statusKind });
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
      className={`node-card${isBlocked ? " node-card--blocked" : ""}`}
      data-testid="audio-node"
      style={{ position: "relative" }}
    >
      <NodeCardHeader
        kind="audio"
        title="Audio"
        meta={isBlocked ? <BlockedBadge nodeId={id} /> : undefined}
      />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {node.sourceKind === "file" && !node.assetId ? (
          <div className="node-card__placeholder">no asset</div>
        ) : status.statusKind === "error" ? (
          <div
            className="node-card__placeholder"
            title={status.error ?? undefined}
          >
            error
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              width: PREVIEW_W,
              height: PREVIEW_H,
            }}
          >
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                display: isBlocked ? "none" : "block",
                background: "#000",
                borderRadius: 3,
                opacity: status.ready ? 1 : 0.4,
              }}
            />
            {isBlocked && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "repeating-linear-gradient(45deg, var(--surface-node-card-solid) 0 6px, var(--surface-card) 6px 12px)",
                  borderRadius: 3,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-secondary)",
                  }}
                >
                  muted
                </span>
              </div>
            )}
          </div>
        )}
        <div className="node-card__meta">
          {status.statusKind === "denied"
            ? "mic blocked"
            : status.statusKind === "pending" && isBlocked
              ? "awaiting permission…"
              : status.ready
                ? `${node.fftSize / 2} bins`
                : status.statusKind === "error"
                  ? "load failed"
                  : sourceLabel}
        </div>
      </div>
      <PortHandle
        port={{ name: "texture", type: "texture" }}
        side="out"
        top={PORT_TOP_PAD}
        dimmed={isBlocked}
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

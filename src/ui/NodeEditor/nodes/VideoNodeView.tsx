import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import {
  getExternalStatus,
  getExternalVideoElement,
} from "../../../core/external/registry";
import type { VideoGraphNode } from "../../../core/graph/types";
import { displayNodeName } from "../../../core/nodes/registry";
import { useAssetStore } from "../../../state/assetStore";
import { tokens, withAlpha } from "../../../theme";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

// 16:9 letterbox card (dc L306-315): 74px outer container, 52px inner frame.
const LETTERBOX_H = 74;
const FRAME_H = 52;
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
  // 1% 단위 반올림으로 200ms 폴링 재렌더를 억제 (스크럽 바 진행률용).
  const [progress, setProgress] = useState(0);
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
      if (v && Number.isFinite(v.duration) && v.duration > 0) {
        setProgress(Math.round((v.currentTime / v.duration) * 100) / 100);
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
      <NodeCardHeader kind="video" title={displayNodeName(node)} nodeId={id} />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {!node.assetId ? (
          <div className="node-card__placeholder">no asset</div>
        ) : status.error ? (
          <div className="node-card__placeholder" title={status.error}>
            error
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              height: LETTERBOX_H,
              borderRadius: 5,
              background: "var(--surface-letterbox)",
              border: "1px solid var(--border-node)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: FRAME_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: status.ready ? 1 : 0.4,
                }}
              />
              {!node.playing && (
                <div
                  data-testid="video-play-glyph"
                  style={{
                    position: "relative",
                    width: 0,
                    height: 0,
                    borderStyle: "solid",
                    borderWidth: "7px 0 7px 12px",
                    // dc rgba(231,234,238,0.75) === text.primary(#e7eaee) + 0.75.
                    borderColor: `transparent transparent transparent ${withAlpha(tokens.text.primary, 0.75)}`,
                    marginLeft: 2,
                    pointerEvents: "none",
                  }}
                />
              )}
              <div
                data-testid="video-scrub"
                style={{
                  position: "absolute",
                  left: 6,
                  right: 6,
                  bottom: 5,
                  height: 2,
                  borderRadius: 1,
                  // dc rgba(255,255,255,0.18)의 white 채널 파생 회피 — 근접한
                  // text.primary color-mix로 근사, 사유 주석 + followup 기록됨.
                  background:
                    "color-mix(in srgb, var(--text-primary) 18%, transparent)",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    borderRadius: 1,
                    background: "var(--node-cat-source)",
                  }}
                />
              </div>
            </div>
          </div>
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

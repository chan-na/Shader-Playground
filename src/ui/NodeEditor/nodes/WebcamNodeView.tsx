import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type { ExternalStatusKind } from "../../../core/external/registry";
import {
  getExternalStatus,
  getExternalStream,
} from "../../../core/external/registry";
import type { WebcamGraphNode } from "../../../core/graph/types";
import { BlockedBadge } from "./BlockedBadge";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";

const PREVIEW_W = 96;
const PREVIEW_H = 64;
const POLL_MS = 200;

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
  statusKind: ExternalStatusKind;
}

export function WebcamNodeView({ id, data }: NodeProps) {
  const node = data.node as WebcamGraphNode;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>({
    ready: false,
    error: null,
    width: 0,
    height: 0,
    statusKind: "pending",
  });
  const isBlocked =
    status.statusKind === "pending" || status.statusKind === "denied";

  // The external registry owns the underlying stream and updates lazily,
  // so we poll every 200ms — light enough to stay invisible in the profile,
  // fast enough that camera attach feels instant.
  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const s = getExternalStatus(id);
      if (s) setStatus({ ...s });
      const stream = getExternalStream(id);
      const v = videoRef.current;
      if (v && stream && v.srcObject !== stream) {
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        // play() may reject (autoplay policy) OR throw synchronously/return
        // undefined (jsdom's HTMLMediaElement.play is not implemented) —
        // same non-fatal handling as registry.ts's startWebcam/applyVideoSpec.
        try {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
          // Non-fatal — the underlying stream still flows.
        }
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [id]);

  return (
    <div
      className={`node-card${isBlocked ? " node-card--blocked" : ""}`}
      data-testid="webcam-node"
      style={{ position: "relative" }}
    >
      <NodeCardHeader
        kind="webcam"
        title="Webcam"
        meta={isBlocked ? <BlockedBadge nodeId={id} /> : undefined}
      />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {status.statusKind === "error" ? (
          <div
            className="node-card__placeholder"
            title={status.error ?? undefined}
          >
            error
          </div>
        ) : (
          // The <video> is always mounted so srcObject can attach as soon as
          // the stream is ready — hiding it conditionally would re-create the
          // element and lose the attach. The blocked hatch placeholder is a
          // sibling overlay instead of a swap-in replacement.
          <div
            style={{
              position: "relative",
              width: PREVIEW_W,
              height: PREVIEW_H,
            }}
          >
            <video
              ref={videoRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              autoPlay
              muted
              playsInline
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                display: isBlocked ? "none" : "block",
                objectFit: "cover",
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
                  no signal
                </span>
              </div>
            )}
          </div>
        )}
        <div className="node-card__meta">
          {status.statusKind === "denied"
            ? "camera blocked"
            : status.statusKind === "pending"
              ? "awaiting permission…"
              : status.ready && status.width && status.height
                ? `${status.width}×${status.height}`
                : status.error
                  ? "permission denied?"
                  : (node.deviceId ?? "default device")}
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

import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import {
  getExternalStatus,
  getExternalStream,
} from "../../../core/external/registry";
import type { WebcamGraphNode } from "../../../core/graph/types";
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
}

export function WebcamNodeView({ id, data }: NodeProps) {
  const node = data.node as WebcamGraphNode;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StatusSnapshot>({
    ready: false,
    error: null,
    width: 0,
    height: 0,
  });

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
        v.play().catch(() => {});
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
      className="node-card"
      data-testid="webcam-node"
      style={{ position: "relative" }}
    >
      <NodeCardHeader kind="webcam" title="Webcam" />
      <div className="node-card__body" style={{ paddingRight: 22 }}>
        {status.error ? (
          <div className="node-card__placeholder" title={status.error}>
            error
          </div>
        ) : (
          // The <video> is always mounted so srcObject can attach as soon as
          // the stream is ready — hiding it conditionally would re-create the
          // element and lose the attach.
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
              ? "permission denied?"
              : (node.deviceId ?? "default device")}
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

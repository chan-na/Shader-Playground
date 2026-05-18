import { useEffect, useState } from "react";
import { getExternalStatus } from "../../core/external/registry";
import type { WebcamGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
}

export function WebcamInspector({ node }: { node: WebcamGraphNode }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const setWebcamConfig = useGraphStore((s) => s.setWebcamConfig);

  // enumerateDevices labels are empty until the user grants permission once.
  // Re-enumerate when permission status changes (devicechange event) so the
  // dropdown picks up readable names after the first acquire.
  useEffect(() => {
    let cancelled = false;
    const enumerate = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.enumerateDevices
      ) {
        return;
      }
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(
          list
            .filter((d) => d.kind === "videoinput")
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || `Camera ${i + 1}`,
            })),
        );
      } catch {
        // ignore — surface as "no devices" in the dropdown
      }
    };
    void enumerate();
    const onChange = () => void enumerate();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setStatus(getExternalStatus(node.id));
      timer = window.setTimeout(tick, 500);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [node.id]);

  return (
    <div className="inspector-section">
      <div className="inspector-label">Webcam</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <label
          htmlFor={`webcam-device-${node.id}`}
          style={{ display: "block", color: "#bbb", marginBottom: 4 }}
        >
          Device
        </label>
        <select
          id={`webcam-device-${node.id}`}
          data-testid="webcam-device-select"
          value={node.deviceId ?? ""}
          onChange={(e) =>
            setWebcamConfig(node.id, { deviceId: e.target.value })
          }
          style={{
            width: "100%",
            background: "#1a1a1a",
            color: "#ddd",
            border: "1px solid #333",
            padding: "4px 6px",
            fontSize: 12,
            borderRadius: 3,
          }}
        >
          <option value="">Default device</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ color: "#888", fontSize: 11 }}>
        {status?.error
          ? `error: ${status.error}`
          : status?.ready
            ? `live · ${status.width}×${status.height}`
            : "requesting permission…"}
      </div>
    </div>
  );
}

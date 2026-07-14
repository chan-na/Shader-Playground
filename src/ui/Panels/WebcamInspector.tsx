import { useEffect, useState } from "react";
import type { ExternalStatusKind } from "../../core/external/registry";
import {
  getExternalStatus,
  retryExternalSource,
} from "../../core/external/registry";
import type { WebcamGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { log, normalizeError } from "../../utils/log";
import { SelectField } from "../controls/SelectField";
import { PermissionBanner } from "./PermissionBanner";
import { StatusPill } from "./StatusPill";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
  statusKind: ExternalStatusKind;
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
      } catch (e) {
        log.debug("external", "enumerateDevices failed", normalizeError(e));
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

  const deviceSelectId = `webcam-device-${node.id}`;
  const isPending = status?.statusKind === "pending";
  const isDenied = status?.statusKind === "denied";
  const fieldsLocked = isPending || isDenied;

  return (
    <div className="inspector-section">
      <div className="inspector-label">Webcam</div>
      {fieldsLocked && (
        <PermissionBanner
          device="camera"
          state={isDenied ? "denied" : "pending"}
          onRetry={() => retryExternalSource(node.id)}
        />
      )}
      <div
        style={{
          marginBottom: 15,
          opacity: fieldsLocked ? 0.55 : 1,
          pointerEvents: fieldsLocked ? "none" : "auto",
        }}
      >
        <label
          htmlFor={deviceSelectId}
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Device
        </label>
        <SelectField
          id={deviceSelectId}
          value={node.deviceId ?? ""}
          onChange={(e) =>
            setWebcamConfig(node.id, { deviceId: e.target.value })
          }
          dataTestId="webcam-device-select"
        >
          <option value="">Default device</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </SelectField>
      </div>

      {/* Denied already surfaces its own copy + retry via PermissionBanner —
       * showing the pill too would repeat the same message twice. */}
      {!isDenied && (
        <StatusPill
          tone={status?.error ? "error" : status?.ready ? "success" : "muted"}
        >
          {status?.error
            ? `error: ${status.error}`
            : status?.ready
              ? `live · ${status.width}×${status.height}`
              : "requesting permission…"}
        </StatusPill>
      )}
    </div>
  );
}

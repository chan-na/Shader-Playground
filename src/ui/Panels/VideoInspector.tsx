import { useEffect, useState } from "react";
import { getExternalStatus } from "../../core/external/registry";
import type { VideoGraphNode } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";
import { SelectField } from "../controls/SelectField";
import { Slider } from "../controls/Slider";
import { Toggle } from "../controls/Toggle";
import { StatusPill } from "./StatusPill";

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
  width: number;
  height: number;
}

export function VideoInspector({ node }: { node: VideoGraphNode }) {
  const setVideoConfig = useGraphStore((s) => s.setVideoConfig);
  const videos = useAssetStore((s) => s.videos);
  const videoList = Object.values(videos);
  const currentAsset = node.assetId ? videos[node.assetId] : null;
  const [status, setStatus] = useState<StatusSnapshot | null>(null);

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

  const duration = currentAsset?.duration ?? 0;
  const seekValue = node.currentTime ?? 0;
  const assetSelectId = `video-asset-${node.id}`;

  return (
    <div className="inspector-section">
      <div className="inspector-label">Video</div>
      <div style={{ marginBottom: 15 }}>
        <label
          htmlFor={assetSelectId}
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Asset
        </label>
        <SelectField
          id={assetSelectId}
          value={node.assetId ?? ""}
          onChange={(e) =>
            setVideoConfig(node.id, { assetId: e.target.value || null })
          }
          dataTestId="video-asset-select"
        >
          <option value="">— no asset —</option>
          {videoList.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 15,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--text-bright-body)" }}>
            Play
          </span>
          <Toggle
            checked={node.playing}
            onChange={(next) => setVideoConfig(node.id, { playing: next })}
            ariaLabel="Play"
            dataTestId="video-playing"
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--text-bright-body)" }}>
            Loop
          </span>
          <Toggle
            checked={node.loop}
            onChange={(next) => setVideoConfig(node.id, { loop: next })}
            ariaLabel="Loop"
            dataTestId="video-loop"
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--text-bright-body)" }}>
            Mute
          </span>
          <Toggle
            checked={node.muted}
            onChange={(next) => setVideoConfig(node.id, { muted: next })}
            ariaLabel="Mute"
            dataTestId="video-muted"
          />
        </div>
      </div>

      {duration > 0 && (
        <div style={{ marginBottom: 15 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Seek · {seekValue.toFixed(2)}s / {duration.toFixed(2)}s
          </div>
          <Slider
            value={seekValue}
            min={0}
            max={duration}
            step={0.05}
            onChange={(v) => setVideoConfig(node.id, { currentTime: v })}
            ariaLabel="Seek"
            dataTestId="video-seek"
          />
        </div>
      )}

      <StatusPill
        tone={
          !node.assetId
            ? "muted"
            : status?.error
              ? "error"
              : status?.ready
                ? "success"
                : "muted"
        }
      >
        {!node.assetId
          ? "Import a video in the Asset browser first."
          : status?.error
            ? `error: ${status.error}`
            : status?.ready
              ? `live · ${status.width}×${status.height}`
              : "loading…"}
      </StatusPill>
    </div>
  );
}

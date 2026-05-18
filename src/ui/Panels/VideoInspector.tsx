import { useEffect, useState } from "react";
import { getExternalStatus } from "../../core/external/registry";
import type { VideoGraphNode } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";

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

  return (
    <div className="inspector-section">
      <div className="inspector-label">Video</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <label
          htmlFor={`video-asset-${node.id}`}
          style={{ display: "block", color: "#bbb", marginBottom: 4 }}
        >
          Asset
        </label>
        <select
          id={`video-asset-${node.id}`}
          data-testid="video-asset-select"
          value={node.assetId ?? ""}
          onChange={(e) =>
            setVideoConfig(node.id, { assetId: e.target.value || null })
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
          <option value="">— no asset —</option>
          {videoList.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "#bbb",
          }}
        >
          <input
            type="checkbox"
            checked={node.playing}
            data-testid="video-playing"
            onChange={(e) =>
              setVideoConfig(node.id, { playing: e.target.checked })
            }
          />
          Play
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "#bbb",
          }}
        >
          <input
            type="checkbox"
            checked={node.loop}
            data-testid="video-loop"
            onChange={(e) =>
              setVideoConfig(node.id, { loop: e.target.checked })
            }
          />
          Loop
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "#bbb",
          }}
        >
          <input
            type="checkbox"
            checked={node.muted}
            data-testid="video-muted"
            onChange={(e) =>
              setVideoConfig(node.id, { muted: e.target.checked })
            }
          />
          Mute
        </label>
      </div>

      {duration > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label
            htmlFor={`video-seek-${node.id}`}
            style={{
              display: "block",
              color: "#bbb",
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Seek · {seekValue.toFixed(2)}s / {duration.toFixed(2)}s
          </label>
          <input
            id={`video-seek-${node.id}`}
            data-testid="video-seek"
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={seekValue}
            onChange={(e) =>
              setVideoConfig(node.id, {
                currentTime: parseFloat(e.target.value),
              })
            }
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div style={{ color: "#888", fontSize: 11 }}>
        {!node.assetId
          ? "Import a video in the Asset browser first."
          : status?.error
            ? `error: ${status.error}`
            : status?.ready
              ? `live · ${status.width}×${status.height}`
              : "loading…"}
      </div>
    </div>
  );
}

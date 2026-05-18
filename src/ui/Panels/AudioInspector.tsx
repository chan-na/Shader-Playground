import { useEffect, useState } from "react";
import { getExternalStatus } from "../../core/external/registry";
import type { AudioFftSize, AudioGraphNode } from "../../core/graph/types";
import { AUDIO_FFT_SIZES } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
}

export function AudioInspector({ node }: { node: AudioGraphNode }) {
  const setAudioConfig = useGraphStore((s) => s.setAudioConfig);
  const audios = useAssetStore((s) => s.audios);
  const audioList = Object.values(audios);
  const [status, setStatus] = useState<StatusSnapshot | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const s = getExternalStatus(node.id);
      setStatus(s ? { ready: s.ready, error: s.error } : null);
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
      <div className="inspector-label">Audio</div>

      <div style={{ display: "flex", gap: 12, fontSize: 12, marginBottom: 8 }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "#bbb",
          }}
        >
          <input
            type="radio"
            name={`audio-source-${node.id}`}
            checked={node.sourceKind === "mic"}
            data-testid="audio-source-mic"
            onChange={() => setAudioConfig(node.id, { sourceKind: "mic" })}
          />
          Microphone
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
            type="radio"
            name={`audio-source-${node.id}`}
            checked={node.sourceKind === "file"}
            data-testid="audio-source-file"
            onChange={() => setAudioConfig(node.id, { sourceKind: "file" })}
          />
          File
        </label>
      </div>

      {node.sourceKind === "file" && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <label
            htmlFor={`audio-asset-${node.id}`}
            style={{ display: "block", color: "#bbb", marginBottom: 4 }}
          >
            Asset
          </label>
          <select
            id={`audio-asset-${node.id}`}
            data-testid="audio-asset-select"
            value={node.assetId ?? ""}
            onChange={(e) =>
              setAudioConfig(node.id, { assetId: e.target.value || null })
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
            {audioList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <label
          htmlFor={`audio-fft-${node.id}`}
          style={{ display: "block", color: "#bbb", marginBottom: 4 }}
        >
          FFT size
        </label>
        <select
          id={`audio-fft-${node.id}`}
          data-testid="audio-fft-select"
          value={node.fftSize}
          onChange={(e) =>
            setAudioConfig(node.id, {
              fftSize: Number(e.target.value) as AudioFftSize,
            })
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
          {AUDIO_FFT_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {sz} ({sz / 2} bins)
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label
          htmlFor={`audio-smoothing-${node.id}`}
          style={{
            display: "block",
            color: "#bbb",
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          Smoothing · {node.smoothing.toFixed(2)}
        </label>
        <input
          id={`audio-smoothing-${node.id}`}
          data-testid="audio-smoothing"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={node.smoothing}
          onChange={(e) =>
            setAudioConfig(node.id, {
              smoothing: parseFloat(e.target.value),
            })
          }
          style={{ width: "100%" }}
        />
      </div>

      {node.sourceKind === "file" && (
        <div
          style={{ display: "flex", gap: 12, fontSize: 12, marginBottom: 8 }}
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
              data-testid="audio-playing"
              onChange={(e) =>
                setAudioConfig(node.id, { playing: e.target.checked })
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
              data-testid="audio-loop"
              onChange={(e) =>
                setAudioConfig(node.id, { loop: e.target.checked })
              }
            />
            Loop
          </label>
        </div>
      )}

      <div style={{ color: "#888", fontSize: 11 }}>
        {node.sourceKind === "file" && !node.assetId
          ? "Import an audio file in the Asset browser first."
          : status?.error
            ? `error: ${status.error}`
            : status?.ready
              ? `live · ${node.fftSize / 2} bins`
              : "loading…"}
      </div>
    </div>
  );
}

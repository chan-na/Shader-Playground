import { useEffect, useState } from "react";
import { getExternalStatus } from "../../core/external/registry";
import type { AudioFftSize, AudioGraphNode } from "../../core/graph/types";
import { AUDIO_FFT_SIZES } from "../../core/graph/types";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";
import { SegmentedControl } from "../controls/SegmentedControl";
import { SelectField } from "../controls/SelectField";
import { Slider } from "../controls/Slider";
import { Toggle } from "../controls/Toggle";
import { StatusPill } from "./StatusPill";

interface StatusSnapshot {
  ready: boolean;
  error: string | null;
}

const SOURCE_OPTIONS = [
  { value: "mic", label: "Microphone", dataTestId: "audio-source-mic" },
  { value: "file", label: "File", dataTestId: "audio-source-file" },
];

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

  const assetSelectId = `audio-asset-${node.id}`;
  const fftSelectId = `audio-fft-${node.id}`;

  return (
    <div className="inspector-section">
      <div className="inspector-label">Audio</div>

      <div style={{ marginBottom: 15 }}>
        <SegmentedControl
          options={SOURCE_OPTIONS}
          value={node.sourceKind}
          onChange={(v) => {
            if (v === "mic" || v === "file") {
              setAudioConfig(node.id, { sourceKind: v });
            }
          }}
          ariaLabel="Audio source"
        />
      </div>

      {node.sourceKind === "file" && (
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
              setAudioConfig(node.id, { assetId: e.target.value || null })
            }
            dataTestId="audio-asset-select"
          >
            <option value="">— no asset —</option>
            {audioList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <div style={{ flex: 1 }}>
          <label
            htmlFor={fftSelectId}
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            FFT size
          </label>
          <SelectField
            id={fftSelectId}
            value={node.fftSize}
            onChange={(e) =>
              setAudioConfig(node.id, {
                fftSize: Number(e.target.value) as AudioFftSize,
              })
            }
            dataTestId="audio-fft-select"
          >
            {AUDIO_FFT_SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz} ({sz / 2} bins)
              </option>
            ))}
          </SelectField>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Smoothing · {node.smoothing.toFixed(2)}
          </div>
          <Slider
            value={node.smoothing}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setAudioConfig(node.id, { smoothing: v })}
            ariaLabel="Smoothing"
            dataTestId="audio-smoothing"
          />
        </div>
      </div>

      {node.sourceKind === "file" && (
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
              onChange={(next) => setAudioConfig(node.id, { playing: next })}
              ariaLabel="Play"
              dataTestId="audio-playing"
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
              onChange={(next) => setAudioConfig(node.id, { loop: next })}
              ariaLabel="Loop"
              dataTestId="audio-loop"
            />
          </div>
        </div>
      )}

      <StatusPill
        tone={
          node.sourceKind === "file" && !node.assetId
            ? "muted"
            : status?.error
              ? "error"
              : status?.ready
                ? "success"
                : "muted"
        }
      >
        {node.sourceKind === "file" && !node.assetId
          ? "Import an audio file in the Asset browser first."
          : status?.error
            ? `error: ${status.error}`
            : status?.ready
              ? `live · ${node.fftSize / 2} bins`
              : "loading…"}
      </StatusPill>
    </div>
  );
}

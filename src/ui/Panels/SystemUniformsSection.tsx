import { useEffect, useState } from "react";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import {
  SYSTEM_UNIFORM_DESCRIPTIONS,
  type UniformSpec,
} from "../../core/graph/uniformParser";
import { mouseVec4, useMouseStore } from "../../state/mouseStore";
import type { ShaderPassRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { useTimeStore } from "../../state/timeStore";
import { systemUniformBinding } from "./systemUniformStatus";

/**
 * [C-1] u_time/u_mouse sampling interval (ms). Mirrors StatusBar.tsx's
 * TIME_SAMPLE_INTERVAL_MS pattern: both values are mutated on hot paths
 * (RAF for simTime, every pointermove for the mouse position) that we do not
 * want this section subscribing to directly — that would re-render it up to
 * 60x/sec for a value display that only needs to look "live", not exact.
 * Polling on a timer instead samples a fresh snapshot without becoming a
 * subscriber of either hot-path store.
 */
const SAMPLE_INTERVAL_MS = 500;

interface UniformSample {
  time: string;
  mouseX: number;
  mouseY: number;
}

function sampleNow(): UniformSample {
  const m = mouseVec4(useMouseStore.getState());
  return {
    time: `${useTimeStore.getState().simTime.toFixed(2)}s`,
    mouseX: Math.round(m[0]),
    mouseY: Math.round(m[1]),
  };
}

function useUniformSample(): UniformSample {
  const [sample, setSample] = useState(sampleNow);
  useEffect(() => {
    const id = setInterval(() => setSample(sampleNow()), SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return sample;
}

/**
 * Current-value display for a system uniform, reading only values *already*
 * published somewhere in the store graph — never a new RAF-path publish
 * (the round's "no new RAF publishes" constraint). `u_frame` and the
 * matrices/`u_camera` have no such published value (they're derived
 * RAF-locally in execute.ts), so they always show "—"; that gap is a
 * tracked followup rather than a new publish path.
 */
function valueFor(
  name: string,
  sample: UniformSample,
  shaderRow: ShaderPassRow | undefined,
): string {
  switch (name) {
    case "u_time":
      return sample.time;
    case "u_mouse":
      return `${sample.mouseX}, ${sample.mouseY}`;
    case "u_resolution":
      return shaderRow ? `${shaderRow.width}×${shaderRow.height}` : "—";
    default:
      return "—";
  }
}

export interface SystemUniformsSectionProps {
  specs: UniformSpec[];
  owner: ShaderGraphNode | ComputeGraphNode;
}

/**
 * [C-1] "System uniforms (auto-bound)" Inspector section — moved out of
 * Inspector.tsx unchanged in its row testids/structure (`system-uniform-row`,
 * `data-uniform-name`, `SYSTEM_UNIFORM_DESCRIPTIONS`) and extended with:
 *  - whether *this* node's pass actually binds each uniform this frame
 *    (`systemUniformBinding`, a pure mirror of execute.ts's own decision —
 *    never inferred from the graph shape), and
 *  - a best-effort current value sampled from already-published stores.
 */
export function SystemUniformsSection({
  specs,
  owner,
}: SystemUniformsSectionProps) {
  const isFullscreen = usePassPlanStore(
    (s) => s.fullscreenByNode[owner.id] === true,
  );
  const shaderRow = usePassPlanStore((s) =>
    s.rows.find(
      (r): r is ShaderPassRow => r.kind === "shader" && r.nodeId === owner.id,
    ),
  );
  const sample = useUniformSample();

  return (
    <div className="inspector-section">
      <div className="inspector-label">System uniforms (auto-bound)</div>
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: 11,
          marginTop: 2,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        렌더러가 자동 주입하므로 그래프 input port에는 노출되지 않습니다.
      </div>
      {specs.map((s) => {
        const desc = SYSTEM_UNIFORM_DESCRIPTIONS[s.name];
        const binding = systemUniformBinding(s.name, owner.kind, isFullscreen);
        const value = valueFor(s.name, sample, shaderRow);
        return (
          <div
            key={s.name}
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 2,
              lineHeight: 1.4,
            }}
            data-testid="system-uniform-row"
            data-uniform-name={s.name}
            data-bound={binding.bound}
          >
            <span style={{ fontFamily: "var(--font-mono)" }}>
              <span
                style={
                  binding.bound ? undefined : { color: "var(--text-disabled)" }
                }
              >
                {s.name}
              </span>{" "}
              <span style={{ color: "var(--text-disabled)" }}>· {s.type}</span>
            </span>
            {desc && (
              <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>
                — {desc}
              </span>
            )}
            {binding.note && (
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                {binding.note}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                marginLeft: 6,
              }}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

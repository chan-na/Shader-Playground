import { useEffect, useState } from "react";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import {
  SYSTEM_UNIFORM_DESCRIPTIONS,
  type UniformSpec,
} from "../../core/graph/uniformParser";
import { mouseVec4, useMouseStore } from "../../state/mouseStore";
import type { ShaderPassRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { useRendererStore } from "../../state/rendererStore";
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

/** Raw canvas-framebuffer pixels — `valueFor` rescales to pass space, so
 *  rounding has to happen after that multiply, not here. */
function sampleNow(): UniformSample {
  const m = mouseVec4(useMouseStore.getState());
  return {
    time: `${useTimeStore.getState().simTime.toFixed(2)}s`,
    mouseX: m[0],
    mouseY: m[1],
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
  canvas: { width: number; height: number },
): string {
  switch (name) {
    case "u_time":
      return sample.time;
    case "u_mouse": {
      // Mirrors `execute.ts`'s `bindSystemUniforms` exactly: the store holds
      // canvas-framebuffer pixels, but each pass receives them rescaled by
      // `pass.width / ctx.width` so `u_mouse.xy / u_resolution` stays in
      // range at resolutionScale < 1. Showing the unscaled store value put
      // this row in a different coordinate space from the `u_resolution` row
      // directly below it, which has always been pass-space — at 0.5× on an
      // 800×600 canvas the shader saw (400, 300) while this read "800, 600".
      const mx = shaderRow ? shaderRow.width / Math.max(1, canvas.width) : 1;
      const my = shaderRow ? shaderRow.height / Math.max(1, canvas.height) : 1;
      return `${Math.round(sample.mouseX * mx)}, ${Math.round(sample.mouseY * my)}`;
    }
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
  // Changes only on canvas resize (`setCanvasSize` keeps the previous object
  // when the dimensions are unchanged), so subscribing is reference-stable.
  const canvasSize = useRendererStore((s) => s.canvasSize);
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
        // A value next to "not bound (fullscreen pass)" reads as "here's what
        // your shader is receiving" — but nothing is uploaded for that
        // uniform at all, so the shader sees GL zero. Withhold it: the row's
        // job in that state is to explain the absence.
        const value = binding.bound
          ? valueFor(s.name, sample, shaderRow, canvasSize)
          : "—";
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

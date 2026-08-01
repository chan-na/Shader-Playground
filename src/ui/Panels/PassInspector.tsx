import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { displayNodeName } from "../../core/nodes/registry";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { useGraphStore } from "../../state/graphStore";
import type { ComputePassRow, PassRow } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import {
  computeMeshLabel,
  formatFbo,
  formatGpuMs,
  formatSampler,
} from "./passInspectorFormat";

const CELL_STYLE: CSSProperties = {
  borderBottom: "1px solid var(--border-default)",
  padding: "3px 6px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const TH_STYLE: CSSProperties = {
  ...CELL_STYLE,
  color: "var(--text-muted)",
  fontWeight: 400,
};

/** Live ping-pong read-side polling interval (ms). See the effect below. */
const READ_POLL_INTERVAL_MS = 250;

/**
 * Pass Inspector body (T1/D-1, L5): "what actually runs this frame, in
 * order" — `plan.passes[]` topological order, FBO size, mesh source,
 * sampler bindings, GPU ms. Every value is sourced from `passPlanStore`,
 * which `Viewport/index.tsx`'s `recompile()` publishes once per structural
 * graph change — never on the RAF hot path (see `passPlanStore.ts`'s
 * `ComputePassRow.getRead` doc for why the ping-pong read side is a closure
 * rather than a per-frame store write).
 *
 * **Placement is a design-request v2.3 (AA1) interim decision**: the bottom
 * transient overlay region is a single dc-defined slot (design/CHANGELOG.md
 * §v1.4 R5) that `debugUiStore` already time-shared between
 * diagnostics/problems; extending it to 3-way (+ passes) is a point the
 * v2.2 design bundle doesn't define. See `debugUiStore.ts`'s header comment
 * for the full note and `StatusOverlays.tsx` for the mount point.
 */
export function PassInspector() {
  const rows = usePassPlanStore((s) => s.rows);
  const nodes = useGraphStore((s) => s.nodes);
  const gpuByNode = useGpuTimerStore((s) => s.byNode);
  const gpuSupported = useGpuTimerStore((s) => s.supported);
  const gpuEnabled = useGpuTimerStore((s) => s.enabled);

  // Row summaries only change on recompile, but a ComputePassRow's `read`
  // side is a closure over the *live* pass object and flips every frame.
  // This interval doesn't publish anything to any store (0 new `set` calls
  // on the RAF hot path) — it just forces this component to re-render while
  // it's mounted (i.e. while the overlay is open) so `row.getRead()` gets
  // re-invoked and the read=A/B column actually moves.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), READ_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Mirrors ProblemsPanel.tsx's `nodeLabel`: a row can outlive its node
  // (deleted while the pane summary is still in flight) — fall back to the
  // raw id so the row still identifies *something*.
  const nodeLabel = (id: string): string => {
    const n = nodes.find((nn) => nn.id === id);
    return n ? displayNodeName(n) : id;
  };

  const meshCell = (row: PassRow): string => {
    if (row.kind === "compute") {
      return computeMeshLabel(row.primitiveLabel, row.count, row.getRead());
    }
    if (row.meshIsFullscreen) return "fullscreen quad";
    const driverId = row.meshComputeNodeId;
    if (driverId) {
      const driver = rows.find(
        (r): r is ComputePassRow =>
          r.kind === "compute" && r.nodeId === driverId,
      );
      return driver
        ? computeMeshLabel(
            driver.primitiveLabel,
            driver.count,
            driver.getRead(),
          )
        : "compute";
    }
    return row.meshLabel;
  };

  const samplersCell = (row: PassRow): string => {
    if (row.kind === "compute" || row.samplers.length === 0) return "—";
    return row.samplers
      .map((s) =>
        formatSampler(s.uniformName, nodeLabel(s.sourceNodeId), s.unit),
      )
      .join(", ");
  };

  const gpuCell = (nodeId: string): string =>
    gpuSupported && gpuEnabled ? formatGpuMs(gpuByNode[nodeId]) : "—";

  return (
    <div
      style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "6px 12px" }}
    >
      {rows.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          no passes — compile a shader node first
        </div>
      ) : (
        <table
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            borderCollapse: "collapse",
            width: "100%",
          }}
        >
          <thead>
            <tr>
              <th style={TH_STYLE}>#</th>
              <th style={TH_STYLE}>Node</th>
              <th style={TH_STYLE}>Kind</th>
              <th style={TH_STYLE}>FBO</th>
              <th style={TH_STYLE}>Mesh</th>
              <th style={TH_STYLE}>Samplers</th>
              <th style={TH_STYLE}>GPU ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.nodeId}
                data-testid="pass-row"
                data-node-id={row.nodeId}
              >
                <td style={CELL_STYLE}>{i}</td>
                <td style={CELL_STYLE}>{nodeLabel(row.nodeId)}</td>
                <td style={CELL_STYLE}>{row.kind}</td>
                <td style={CELL_STYLE} data-testid="pass-fbo">
                  {row.kind === "shader"
                    ? formatFbo(row.width, row.height, row.resolutionScale)
                    : "—"}
                </td>
                <td style={CELL_STYLE} data-testid="pass-mesh">
                  {meshCell(row)}
                </td>
                <td style={CELL_STYLE} data-testid="pass-samplers">
                  {samplersCell(row)}
                </td>
                <td style={CELL_STYLE} data-testid="pass-gpu">
                  {gpuCell(row.nodeId)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

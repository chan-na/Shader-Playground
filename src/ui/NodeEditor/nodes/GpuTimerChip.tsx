import { useGpuTimerStore } from "../../../state/gpuTimerStore";
import { tokens, withAlpha } from "../../../theme";

interface Props {
  nodeId: string;
}

/**
 * Tiny "0.42ms" chip rendered in the node card header's meta slot (right
 * side) for shader/compute cards. Reads the smoothed per-node sample from
 * `gpuTimerStore`. Returns null when the extension is unavailable or the
 * user disabled the timer, so unsupported environments
 * (Safari/SwiftShader/Firefox-default) stay visually clean.
 *
 * Style source: design/Node Editor.dc.html L185 — the "0.31ms" chip sitting
 * in the Fresnel header's `margin-left:auto` slot.
 */
export function GpuTimerChip({ nodeId }: Props) {
  const supported = useGpuTimerStore((s) => s.supported);
  const enabled = useGpuTimerStore((s) => s.enabled);
  const ms = useGpuTimerStore((s) => s.byNode[nodeId]);
  if (!supported || !enabled || ms === undefined) return null;
  return (
    <div
      className="node-card__gpu-ms"
      data-testid={`gpu-ms-${nodeId}`}
      title="GPU time spent in this pass (EMA-smoothed)"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--warning)",
        background: tokens.overlay.scrim,
        border: `1px solid ${withAlpha(tokens.semantic.warning, 0.35)}`,
        borderRadius: tokens.radius.iconBox,
        padding: "1px 5px",
      }}
    >
      {ms < 0.01 ? "<0.01ms" : `${ms.toFixed(2)}ms`}
    </div>
  );
}

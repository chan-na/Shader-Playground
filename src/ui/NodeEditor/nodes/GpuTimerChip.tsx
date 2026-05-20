import { useGpuTimerStore } from "../../../state/gpuTimerStore";

interface Props {
  nodeId: string;
}

/**
 * Tiny "0.42ms" chip rendered top-right on shader/compute node cards. Reads
 * the smoothed per-node sample from `gpuTimerStore`. Returns null when the
 * extension is unavailable or the user disabled the timer, so unsupported
 * environments (Safari/SwiftShader/Firefox-default) stay visually clean.
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
    >
      {ms < 0.01 ? "<0.01ms" : `${ms.toFixed(2)}ms`}
    </div>
  );
}

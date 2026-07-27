import { useUpdateNodeInternals } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { PortSpec } from "../../../core/nodes/registry";

/**
 * Stable string identity for a card's rendered port set. Two renders that
 * produce the same signature place the same handle ids in the same rail slots,
 * so React Flow's cached handle bounds are still valid.
 *
 * The slot index is part of the key because a port's `top` is derived from its
 * position in the list — inserting a uniform above an existing one moves every
 * port below it even though no id changed.
 */
export function portSignature(ports: readonly PortSpec[]): string {
  return ports.map((p, i) => `${i}:${p.name}:${p.type}`).join("|");
}

/**
 * Re-register a node's handles with React Flow whenever its rendered port set
 * changes.
 *
 * A connection drag is resolved against `node.internals.handleBounds` — a DOM
 * snapshot React Flow takes on mount, on a ResizeObserver hit, and on an
 * explicit `updateNodeInternals` call. Nothing else refreshes it: `<Handle>`
 * does not register itself with the store.
 *
 * Cards whose ports come from editable state (shader/compute uniforms, math
 * op, combine arity) can gain, lose, or shift a handle without changing the
 * card's measured size — a shader card keeps the 96px thumbnail floor until it
 * has ~5 ports (`multiPortPreviewH`), so declaring the first few uniforms
 * resizes nothing and the observer never fires. The handle then renders in the
 * DOM but stays invisible to the connection logic: `getClosestHandle` can't
 * find it (no snap, no valid-drop highlight, the drop is discarded) and
 * `getHandle` returns null when a drag *starts* on it. Ports below an inserted
 * one keep their stale y, so existing edges land on the old slot.
 *
 * Mount is intentionally skipped — React Flow measures the node then anyway,
 * and a per-node rAF update on every graph load would be pure overhead.
 */
export function usePortInternals(
  nodeId: string,
  ports: readonly PortSpec[],
): void {
  const updateNodeInternals = useUpdateNodeInternals();
  const signature = portSignature(ports);
  const prevSignature = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevSignature.current;
    prevSignature.current = signature;
    if (prev === null || prev === signature) return;
    updateNodeInternals(nodeId);
  }, [nodeId, signature, updateNodeInternals]);
}

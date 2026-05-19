import { Handle, Position } from "@xyflow/react";
import type { PortSpec } from "../../../core/nodes/registry";

interface PortHandleProps {
  port: PortSpec;
  side: "in" | "out";
  top: number;
  /** Hide the textual label and render just the bare pin (used for nodes
   * whose header already conveys the port role unambiguously, e.g. a
   * sole "→ Canvas" Output). Defaults to false so every multi-port view
   * gets a label without needing to opt in. */
  hideLabel?: boolean;
}

/**
 * Handle + textual label aligned to the same vertical offset. The label uses
 * the raw PortSpec.name (e.g. `mesh`, `u_intensity`, `a`) so it maps 1:1 to
 * the underlying uniform/identifier — long names are clamped via CSS ellipsis.
 */
export function PortHandle({ port, side, top, hideLabel }: PortHandleProps) {
  const isIn = side === "in";
  return (
    <>
      <Handle
        id={port.name}
        type={isIn ? "target" : "source"}
        position={isIn ? Position.Left : Position.Right}
        className={`handle-${port.type}`}
        style={{ top }}
      />
      {hideLabel ? null : (
        <span
          className={`node-card__port-label node-card__port-label--${isIn ? "in" : "out"}`}
          style={{ top }}
        >
          {port.name}
        </span>
      )}
    </>
  );
}

/** Vertical-rhythm helpers used across node views so single-port and
 * multi-port cards line up the same way. */
export const PORT_STRIDE = 18;
export const PORT_TOP_PAD = 38;

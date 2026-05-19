import { Handle, Position } from "@xyflow/react";
import type { PortSpec } from "../../../core/nodes/registry";

interface PortHandleProps {
  port: PortSpec;
  side: "in" | "out";
  top: number;
}

/**
 * Handle + textual label aligned to the same vertical offset. The label uses
 * the raw PortSpec.name (e.g. `mesh`, `u_intensity`, `a`) so it maps 1:1 to
 * the underlying uniform/identifier — long names are clamped via CSS ellipsis.
 *
 * Only multi-port views opt in; single-port views keep the handle bare since
 * the card header already conveys the port's role.
 */
export function PortHandle({ port, side, top }: PortHandleProps) {
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
      <span
        className={`node-card__port-label node-card__port-label--${isIn ? "in" : "out"}`}
        style={{ top }}
      >
        {port.name}
      </span>
    </>
  );
}

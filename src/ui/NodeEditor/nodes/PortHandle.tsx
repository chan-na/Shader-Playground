import { Handle, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { PortSpec } from "../../../core/nodes/registry";
import { PORT_DIAMETER, tokens } from "../../../theme";
import { portFamilyHex } from "../nodeTheme";

interface PortHandleProps {
  port: PortSpec;
  side: "in" | "out";
  top: number;
  /** Hide the textual label and render just the bare pin (used for nodes
   * whose header already conveys the port role unambiguously, e.g. a
   * sole "→ Canvas" Output). Defaults to false so every multi-port view
   * gets a label without needing to opt in. */
  hideLabel?: boolean;
  /** Fade the pin to `outOpacity: 0.4` (design/System States.dc.html L483) —
   * used by Webcam/Audio node views on their output port while the source is
   * pending/denied permission, since nothing is flowing through it yet. */
  dimmed?: boolean;
}

/**
 * Handle + textual label aligned to the same vertical offset. The label uses
 * the raw PortSpec.name (e.g. `mesh`, `u_intensity`, `a`) so it maps 1:1 to
 * the underlying uniform/identifier — long names are clamped via CSS ellipsis.
 */
export function PortHandle({
  port,
  side,
  top,
  hideLabel,
  dimmed,
}: PortHandleProps) {
  const isIn = side === "in";
  const fam = portFamilyHex(port.type);
  // 형태(방향) × 색(타입 패밀리) 이중 인코딩 — design/Node Editor.dc.html
  // L156-157(Math in ring/out disc), L81(Mesh out), L190-193(Fresnel).
  const shapeStyle: CSSProperties = isIn
    ? {
        // input = hollow ring: 패밀리색 테두리 + 카드 배경색 내부.
        border: `2.5px solid ${fam}`,
        background: "var(--surface-node-card-solid)",
      }
    : {
        // output = solid disc: 패밀리색 채움 + 카드 배경색 테두리 + 발광.
        background: fam,
        border: "2px solid var(--surface-node-card-solid)",
        boxShadow: tokens.shadow.portOutputGlow(fam),
      };
  return (
    <>
      <Handle
        id={port.name}
        type={isIn ? "target" : "source"}
        position={isIn ? Position.Left : Position.Right}
        className={`handle-${port.type} port-handle port-handle--${side}`}
        style={{
          top,
          width: PORT_DIAMETER.card,
          height: PORT_DIAMETER.card,
          borderRadius: "50%",
          ...shapeStyle,
          ...(dimmed ? { opacity: 0.4 } : null),
        }}
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

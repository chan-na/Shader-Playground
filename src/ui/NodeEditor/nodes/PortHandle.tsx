import { Handle, Position, useNodeId } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { PortSpec } from "../../../core/nodes/registry";
import { useConnectionUiStore } from "../../../state/connectionUiStore";
import { PORT_DIAMETER, tokens } from "../../../theme";
import { portFamilyHex } from "../nodeTheme";
import { portDragMode, snapSeqFor } from "../portDragMode";

/** Pulse ring diameter (px) for a compatible-port fanout highlight —
 *  design/node-connect.jsx L96 uses a 30px ring against its 13px hero port
 *  (`PORT_DIAMETER.hero`); scaled to the card port size (`PORT_DIAMETER.card`
 *  = 11) by the same ratio and rounded to an even number: 30 * 11/13 ≈ 25.4
 *  → 26. File-local (not exported) so knip doesn't flag it as dead. */
const PULSE_RING_D = 26;

/** Snap-ring diameter (px) for the connection-confirmed pulse at a target
 *  input port — design/node-connect.jsx L303-309 uses a 32px ring against
 *  its 13px hero port (`PORT_DIAMETER.hero`); scaled to the card port size
 *  (`PORT_DIAMETER.card` = 11) by the same ratio as `PULSE_RING_D`: 32 *
 *  11/13 ≈ 27.1 → 28 (even). File-local (not exported) so knip doesn't flag
 *  it as dead. */
const SNAP_RING_D = 28;

interface PortHandleProps {
  port: PortSpec;
  side: "in" | "out";
  top: number;
  /** Fade the pin to `outOpacity: 0.4` (design/System States.dc.html L483) —
   * used by Webcam/Audio node views on their output port while the source is
   * pending/denied permission, since nothing is flowing through it yet. */
  dimmed?: boolean;
}

/**
 * Handle + textual label aligned to the same vertical offset. The label uses
 * the raw PortSpec.name (e.g. `mesh`, `u_intensity`, `a`) so it maps 1:1 to
 * the underlying uniform/identifier — long names are clamped via CSS ellipsis.
 *
 * Rail rules [D2] (design/Node Editor.dc.html L190-195): the label always
 * renders in the card's left/right port rail (~46px), colored by the port's
 * type family (`fam`, not a static token — see theme.ts §portFamily), never
 * hidden — every port gets a label so the data type is legible without
 * relying solely on the header color.
 */
export function PortHandle({ port, side, top, dimmed }: PortHandleProps) {
  const isIn = side === "in";
  const fam = portFamilyHex(port.type);
  const nodeId = useNodeId();
  // Selector returns a primitive string, so this only re-renders the port at
  // drag start/end (or when this specific port's classification flips), not
  // on every pointer-move tick of the drag.
  const mode = useConnectionUiStore((s) =>
    portDragMode(port, side, nodeId, s.dragging),
  );
  const clearSnap = useConnectionUiStore((s) => s.clearSnap);
  // Primitive selector (a number), so only the port a connection just landed
  // on re-renders — not every port on every connection.
  const snapSeq = useConnectionUiStore((s) =>
    snapSeqFor(s.snap, nodeId, port.name, side),
  );
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
          // node-connect.jsx L127: incompatible fanout dim is `1 - 0.62 ≈
          // 0.38` ≈ the existing `dimmed` prop's 0.4 — same value, reused
          // rather than introducing a second magic number.
          ...(dimmed || mode === "incompat" ? { opacity: 0.4 } : null),
          // Origin/compat glow — node-connect.jsx L86-88's highlight boxShadow.
          ...(mode === "origin" || mode === "compat"
            ? { boxShadow: `0 0 0 2px ${fam}, 0 0 14px ${fam}` }
            : null),
        }}
      />
      {mode === "compat" && (
        <span
          className="sp-port-pulse-ring"
          style={{
            top: top - PULSE_RING_D / 2,
            width: PULSE_RING_D,
            height: PULSE_RING_D,
            border: `2px solid ${fam}`,
            ...(isIn
              ? { left: -PULSE_RING_D / 2 }
              : { right: -PULSE_RING_D / 2 }),
          }}
        />
      )}
      {snapSeq > 0 && (
        <span
          key={snapSeq}
          className="sp-port-snap-ring"
          onAnimationEnd={clearSnap}
          style={{
            top: top - SNAP_RING_D / 2,
            width: SNAP_RING_D,
            height: SNAP_RING_D,
            border: `2.5px solid ${fam}`,
            ...(isIn
              ? { left: -SNAP_RING_D / 2 }
              : { right: -SNAP_RING_D / 2 }),
          }}
        />
      )}
      <span
        className={`node-card__port-label node-card__port-label--${isIn ? "in" : "out"}`}
        style={{
          top,
          color: fam,
          // Same single dim value as the pin above (0.4) — design/Node
          // Editor.dc.html L217's error-card label opacity (0.55) and the
          // pin's dim opacity are unified to one magic number rather than
          // introducing a second one for the label alone.
          ...(dimmed || mode === "incompat" ? { opacity: 0.4 } : null),
        }}
      >
        {port.name}
      </span>
    </>
  );
}

/** Vertical-rhythm helpers used across node views so single-port and
 * multi-port cards line up the same way. */
export const PORT_STRIDE = 18;
export const PORT_TOP_PAD = 38;

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
  /**
   * [B-1] Native `title` tooltip on hover, forwarded to both the pin (Handle
   * spreads unrecognized props onto its underlying div, `@xyflow/react`'s
   * `HandleProps` extends `HTMLAttributes<HTMLDivElement>`) and the text
   * label — used to surface a mesh port's actual attribute contract, or to
   * flag a compute node's `mesh` output as a TF ping-pong buffer rather than
   * a static mesh.
   */
  tooltip?: string;
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
export function PortHandle({
  port,
  side,
  top,
  dimmed,
  tooltip,
}: PortHandleProps) {
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
        title={tooltip}
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
        title={tooltip}
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

/**
 * Port stride (px) for fixed-arity cards (Math / Combine).
 *
 * NOT governed by C-3/PORT_STRIDE_MULTI: that rule is scoped to cards that
 * "grow one input per uniform" (shader/compute). These cards instead pair
 * each port with a `.node-card__field` row, so their stride is a *dependent
 * variable* of the field row rhythm, not an independent constant — CHANGELOG
 * §v1.3 Q7.
 *
 * Canonical value 27, per CHANGELOG §v1.4 R15 (selection 1: the browser
 * measurement is canonical, the dc is corrected after the fact). Measured
 * 2026-07-17 in Chromium (zoom-normalized getBoundingClientRect,
 * cross-checked with transform-free offsetTop): field row 22
 * (`.node-card__input` = 22 = ~14 content + 3+3 padding + 1+1 border) + body
 * gap 5 = exactly 27 on both Math (2 rows) and Combine (4 rows); the request
 * doc's 26 assumed an input height of 21 (off by one).
 *
 * Coordinate system (Q6): the dc's own Combine handles (44/70/96, stepping
 * by its now-superseded 26) are themselves a pending correction target for
 * this measurement and are not ported here — only the *stride* crosses into
 * this file's `PORT_TOP_PAD`(38) coordinate system, never dc pixel offsets.
 */
export const PORT_STRIDE = 27;

/**
 * Port stride (px) for uniform-driven cards (Shader / Compute) [C-3].
 *
 * 30 per design/Node Editor.dc.html's shader cards — both the 3-port Fresnel
 * (64/94/124) and the 6-port Noise (64…214) step by 30. Since these cards gain
 * an input port per uniform, a fixed stride alone would push lower ports out of
 * a fixed-height card; the helpers below grow the body to match. README's
 * practical ceiling is ~10 ports — deliberately not clamped, as clamping would
 * reintroduce the very overflow this rule exists to remove.
 */
export const PORT_STRIDE_MULTI = 30;

/**
 * First port's y (px), relative to the card's top edge — the single anchor
 * every port's `top` is computed from. Implementation has used one shared
 * constant since v1, even though the dc draws it differently per card kind:
 * Output 40 / Combine 44 / Webcam·Video 50 / Shader 64.
 *
 * That gap was v1's "accepted deviation" from the dc — CHANGELOG §v1.3 Q6
 * promoted it to the canonical rule: port geometry is always handed down as
 * a *rule* ("body expands to cover the port span · 2px tail slack · 96
 * floor"), never as per-card dc pixel offsets, and the implementation
 * derives everything from this one constant's coordinate system. dc pixels
 * (including the 40/44/50/64 above) are review/verification values only —
 * porting them as constants is explicitly forbidden (design/README.md
 * §도메인 "좌표계 주의 (Q6)"). See `PORT_STRIDE`(above) and `portSpanBodyH`
 * (below) for how the rest of the geometry is derived from this anchor.
 */
export const PORT_TOP_PAD = 38;

/** Slack (px) between the last port's bottom and the card's bottom edge —
 *  the dc's 6-port Noise card leaves 2px (card 227 vs port bottom 225). */
const PORT_TAIL_SLACK = 2;

/** Card-relative bottom edge (px) of the last port on an `nPorts` card. */
function portSpanBottom(nPorts: number): number {
  return (
    PORT_TOP_PAD +
    Math.max(0, nPorts - 1) * PORT_STRIDE_MULTI +
    PORT_DIAMETER.card
  );
}

/**
 * Body height (px) that keeps every port inside the card [C-3].
 *
 * `chromeH` is the card's non-body vertical chrome (header + the body's own
 * vertical padding), so the result is exactly the body height at which the
 * last port clears the card's bottom edge by `PORT_TAIL_SLACK`.
 *
 * This implements the CHANGELOG §v1.3 Q5 canonical rule: body grows to cover
 * the port span, ~2px tail slack, 96 floor for thumbnails (README §B). The
 * v1.2 README formula `max(96,(n−1)·30+56)` was officially retired by Q5 —
 * the rule above is the spec now, not that formula.
 *
 * Coordinate system (Q6): the rule is derived here from this file's own
 * `PORT_TOP_PAD`(38), never from the dc. The dc's per-card first-port y
 * (40/44/50/64) and its pixel constants — including the Q5 verification
 * values (96 @3 ports, 176 @6) — are reference/check values only and are not
 * ported into this coordinate system (README's domain rules, Q6).
 */
function portSpanBodyH(nPorts: number, chromeH: number): number {
  return portSpanBottom(nPorts) + PORT_TAIL_SLACK - chromeH;
}

/** Shader card preview (thumbnail) height — chrome is header 30 + padding
 *  9×2 = 48, and the 96 floor is the dc's default thumbnail [D2·C-3]. */
export function multiPortPreviewH(nPorts: number): number {
  return Math.max(96, portSpanBodyH(nPorts, 48));
}

/** Compute card body min-height — same rule, but the body is a kv list with
 *  no thumbnail, so there is no 96 floor: content sizes the card until the
 *  port span exceeds it. Chrome is header 30 + `.node-card__body` padding
 *  8(top)+9(bottom) = 47 [C-3]. This "no 96 floor" handling was the
 *  implementation team's provisional call until CHANGELOG §v1.3 Q8 made it
 *  the current-approved rule, codified in design/README.md §B. */
export function multiPortBodyMinH(nPorts: number): number {
  return Math.max(0, portSpanBodyH(nPorts, 47));
}

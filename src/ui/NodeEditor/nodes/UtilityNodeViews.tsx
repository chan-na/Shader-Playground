import { Handle, type NodeProps, Position } from "@xyflow/react";
import type {
  CombineGraphNode,
  MathGraphNode,
  SwizzleGraphNode,
} from "../../../core/graph/types";
import {
  combineInputPorts,
  combineOutputPort,
  mathInputPorts,
  swizzleOutputPort,
} from "../../../core/nodes/registry";
import { isValidSwizzleMask } from "../../../core/nodes/utility";
import { PortHandle } from "./PortHandle";

const HANDLE_SPACING = 16;
const MATH_TOP_PAD = 28;

export function MathNodeView({ id, data }: NodeProps) {
  const node = data.node as MathGraphNode;
  const inputs = mathInputPorts(node.op);
  // Binary op (a,b) gets port labels so the user can tell the two handles
  // apart; unary keeps the bare handle since "a" alone is unambiguous.
  const labeled = inputs.length >= 2;
  const sidePad = labeled ? 22 : undefined;

  return (
    <div
      className="node-card"
      style={{ position: "relative", minWidth: labeled ? 160 : 132 }}
    >
      <div className="node-card__header node-card__header--param">
        Math · {node.op}
      </div>
      <div
        className="node-card__body"
        style={
          sidePad !== undefined
            ? { paddingLeft: sidePad, paddingRight: sidePad }
            : undefined
        }
      >
        <div className="node-card__param-value">
          {inputs.map((p) => `${p.name}=${valueFor(node, p.name)}`).join("  ")}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      {labeled ? (
        <>
          {inputs.map((p, i) => (
            <PortHandle
              key={p.name}
              port={p}
              side="in"
              top={MATH_TOP_PAD + i * HANDLE_SPACING}
            />
          ))}
          <PortHandle
            port={{ name: "value", type: "float" }}
            side="out"
            top={MATH_TOP_PAD}
          />
        </>
      ) : (
        <>
          {inputs.map((p, i) => (
            <Handle
              key={p.name}
              id={p.name}
              type="target"
              position={Position.Left}
              className={`handle-${p.type}`}
              style={{ top: MATH_TOP_PAD + i * HANDLE_SPACING }}
            />
          ))}
          <Handle
            id="value"
            type="source"
            position={Position.Right}
            className="handle-float"
          />
        </>
      )}
    </div>
  );
}

function valueFor(node: MathGraphNode, name: string): string {
  if (name === "a") return node.a.toFixed(2);
  if (name === "b") return node.b.toFixed(2);
  return "";
}

export function SwizzleNodeView({ id, data }: NodeProps) {
  const node = data.node as SwizzleGraphNode;
  const out = swizzleOutputPort(node.mask);
  const valid = isValidSwizzleMask(node.mask);
  return (
    <div className="node-card" style={{ minWidth: 132 }}>
      <div className="node-card__header node-card__header--param">
        Swizzle · .{node.mask}
      </div>
      <div className="node-card__body">
        <div className="node-card__param-value">
          {valid ? `→ ${out.type}` : "invalid mask"}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="handle-vec4"
      />
      <Handle
        id="value"
        type="source"
        position={Position.Right}
        className={`handle-${out.type}`}
      />
    </div>
  );
}

export function CombineNodeView({ id, data }: NodeProps) {
  const node = data.node as CombineGraphNode;
  const inputs = combineInputPorts(node.arity);
  const out = combineOutputPort(node.arity);
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 160 }}>
      <div className="node-card__header node-card__header--param">
        Combine · {out.type}
      </div>
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        <div className="node-card__param-value">
          {inputs
            // biome-ignore lint/style/noNonNullAssertion: inputs length matches node.values length (arity)
            .map((p, i) => `${p.name}=${node.values[i]!.toFixed(2)}`)
            .join(" ")}
        </div>
        <div className="node-card__meta">{id}</div>
      </div>
      {inputs.map((p, i) => (
        <PortHandle
          key={p.name}
          port={p}
          side="in"
          top={28 + i * HANDLE_SPACING}
        />
      ))}
      <PortHandle port={out} side="out" top={28} />
    </div>
  );
}

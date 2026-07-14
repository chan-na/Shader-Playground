import type { NodeProps } from "@xyflow/react";
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
import { useGraphStore } from "../../../state/graphStore";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_STRIDE, PORT_TOP_PAD, PortHandle } from "./PortHandle";
import { NumberField } from "./ValueInput";

export function MathNodeView({ id, data }: NodeProps) {
  const node = data.node as MathGraphNode;
  const setMathConfig = useGraphStore((s) => s.setMathConfig);
  const inputs = mathInputPorts(node.op);

  return (
    <div className="node-card" style={{ position: "relative", minWidth: 172 }}>
      <NodeCardHeader
        kind="math"
        title="Math"
        meta={<span className="node-card__meta">{node.op}</span>}
      />
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        {inputs.map((p) => (
          <div className="node-card__field" key={p.name}>
            <span className="node-card__field-label">{p.name}</span>
            <NumberField
              value={p.name === "a" ? node.a : node.b}
              onCommit={(v) =>
                setMathConfig(id, p.name === "a" ? { a: v } : { b: v })
              }
              step={0.01}
              ariaLabel={`math ${p.name}`}
            />
          </div>
        ))}
        <div className="node-card__meta">{id}</div>
      </div>
      {inputs.map((p, i) => (
        <PortHandle
          key={p.name}
          port={p}
          side="in"
          top={PORT_TOP_PAD + i * PORT_STRIDE}
        />
      ))}
      <PortHandle
        port={{ name: "value", type: "float" }}
        side="out"
        top={PORT_TOP_PAD}
      />
    </div>
  );
}

export function SwizzleNodeView({ id, data }: NodeProps) {
  const node = data.node as SwizzleGraphNode;
  const setSwizzleMask = useGraphStore((s) => s.setSwizzleMask);
  const out = swizzleOutputPort(node.mask);
  const valid = isValidSwizzleMask(node.mask);
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 168 }}>
      <NodeCardHeader
        kind="swizzle"
        title="Swizzle"
        meta={<span className="node-card__meta">.{node.mask}</span>}
      />
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        <input
          className="node-card__input nodrag"
          type="text"
          value={node.mask}
          maxLength={4}
          placeholder="xyz"
          aria-label="swizzle mask"
          onChange={(e) =>
            setSwizzleMask(
              id,
              e.target.value.toLowerCase().replace(/[^xyzw]/g, ""),
            )
          }
          style={{ textAlign: "center", letterSpacing: 2 }}
        />
        <div
          className="node-card__meta"
          style={{ color: valid ? "var(--text-secondary)" : "var(--error)" }}
        >
          {valid ? `→ ${out.type}` : "invalid mask"}
        </div>
      </div>
      <PortHandle
        port={{ name: "in", type: "vec4" }}
        side="in"
        top={PORT_TOP_PAD}
      />
      <PortHandle port={out} side="out" top={PORT_TOP_PAD} />
    </div>
  );
}

export function CombineNodeView({ id, data }: NodeProps) {
  const node = data.node as CombineGraphNode;
  const setCombineConfig = useGraphStore((s) => s.setCombineConfig);
  const inputs = combineInputPorts(node.arity);
  const out = combineOutputPort(node.arity);
  return (
    <div className="node-card" style={{ position: "relative", minWidth: 176 }}>
      <NodeCardHeader
        kind="combine"
        title="Combine"
        meta={<span className="node-card__meta">{out.type}</span>}
      />
      <div
        className="node-card__body"
        style={{ paddingLeft: 22, paddingRight: 22 }}
      >
        {inputs.map((p, i) => (
          <div className="node-card__field" key={p.name}>
            <span className="node-card__field-label">{p.name}</span>
            <NumberField
              value={node.values[i] ?? 0}
              onCommit={(v) => {
                const next: [number, number, number, number] = [...node.values];
                next[i] = v;
                setCombineConfig(id, { values: next });
              }}
              step={0.01}
              ariaLabel={`combine ${p.name}`}
            />
          </div>
        ))}
        <div className="node-card__meta">{id}</div>
      </div>
      {inputs.map((p, i) => (
        <PortHandle
          key={p.name}
          port={p}
          side="in"
          top={PORT_TOP_PAD + i * PORT_STRIDE}
        />
      ))}
      <PortHandle port={out} side="out" top={PORT_TOP_PAD} />
    </div>
  );
}

import type { NodeProps } from "@xyflow/react";
import type { ParamGraphNode } from "../../../core/graph/types";
import { displayNodeName, paramOutputPort } from "../../../core/nodes/registry";
import { useGraphStore } from "../../../state/graphStore";
import { useTimeStore } from "../../../state/timeStore";
import { NodeCardHeader } from "./NodeCardHeader";
import { PORT_TOP_PAD, PortHandle } from "./PortHandle";
import { colorSwatchHex, formatParamValue } from "./paramNodeViewHelpers";
import { ColorField, NumberField } from "./ValueInput";

const VEC3_AXES = ["x", "y", "z"] as const;
const TIME_FIELDS = ["scale", "offset"] as const;

export function ParamNodeView({ id, data }: NodeProps) {
  const node = data.node as ParamGraphNode;
  const time = useTimeStore((s) => s.simTime);
  const setParamValue = useGraphStore((s) => s.setParamValue);
  const port = paramOutputPort(node.paramKind);
  // "커스텀 표시명 없음" — no user-set `name`, so the paramKind chip fills the
  // meta slot as a fallback. (The legacy `label` source is gone [A-1]; existing
  // projects had it migrated into `name` by projectSanitize.)
  const hasCustomName = Boolean(node.name?.trim());

  return (
    <div
      className="node-card"
      style={{ position: "relative", minWidth: 168 }}
      data-testid={`param-node-${node.paramKind}`}
    >
      <NodeCardHeader
        kind="param"
        title={displayNodeName(node)}
        nodeId={id}
        meta={
          hasCustomName ? undefined : (
            <span className="node-card__meta">{node.paramKind}</span>
          )
        }
      />
      <div
        className="node-card__body"
        style={{ paddingLeft: 14, paddingRight: 22 }}
      >
        {node.paramKind === "float" && (
          <NumberField
            value={typeof node.value === "number" ? node.value : 0}
            onCommit={(v) => setParamValue(id, v)}
            step={0.01}
            ariaLabel="float value"
          />
        )}
        {node.paramKind === "vec3" && Array.isArray(node.value) && (
          <div className="node-card__row">
            {VEC3_AXES.map((axis, i) => (
              <NumberField
                key={axis}
                value={(node.value as number[])[i] ?? 0}
                onCommit={(v) => {
                  const next = [...(node.value as number[])];
                  next[i] = v;
                  setParamValue(id, next);
                }}
                step={0.01}
                ariaLabel={`vec3 ${axis}`}
              />
            ))}
          </div>
        )}
        {node.paramKind === "color" && Array.isArray(node.value) && (
          <div className="node-card__field">
            <ColorField
              value={node.value}
              onCommit={(rgb) => setParamValue(id, [...rgb])}
            />
            <div
              className="node-card__param-swatch"
              style={{
                background: colorSwatchHex(node.value),
                height: 22,
                flex: 1,
              }}
            />
          </div>
        )}
        {node.paramKind === "time" && (
          <>
            <div className="node-card__param-value">
              {formatParamValue(node, time)}
            </div>
            {TIME_FIELDS.map((axis, i) => (
              <div className="node-card__field" key={axis}>
                <span className="node-card__field-label">{axis}</span>
                <NumberField
                  value={
                    Array.isArray(node.value)
                      ? (node.value[i] ?? (i === 0 ? 1 : 0))
                      : i === 0
                        ? 1
                        : 0
                  }
                  onCommit={(v) => {
                    const cur = Array.isArray(node.value)
                      ? [...node.value]
                      : [1, 0];
                    cur[i] = v;
                    setParamValue(id, cur);
                  }}
                  step={0.01}
                  ariaLabel={`time ${axis}`}
                />
              </div>
            ))}
          </>
        )}
      </div>
      <PortHandle port={port} side="out" top={PORT_TOP_PAD} />
    </div>
  );
}

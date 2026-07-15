import type { ParamGraphNode } from "../../core/graph/types";
import { paramOutputPort } from "../../core/nodes/registry";
import { useGraphStore } from "../../state/graphStore";
import { withAlpha } from "../../theme";
import { ColorField } from "../controls/ColorField";
import { MultiSlider } from "../controls/MultiSlider";
import { NumberField } from "../controls/NumberField";
import { Slider } from "../controls/Slider";
import { TextField } from "../controls/TextField";
import { portFamilyHex, portFamilyOf } from "../NodeEditor/nodeTheme";

const TIME_LABELS = ["Scale", "Offset"] as const;

export function ParamInspector({ node }: { node: ParamGraphNode }) {
  const setParamValue = useGraphStore((s) => s.setParamValue);
  const setParamLabel = useGraphStore((s) => s.setParamLabel);

  // [D18] Output type 배지 색 = 포트 타입 패밀리 (design/README.md §도메인 규칙,
  // design/Side Panel.dc.html L141: "vec3 · Vector" 배지 색 = vector 패밀리).
  // paramKind → GLSL 포트 타입은 registry의 paramOutputPort가 단일 출처
  // (float/time → float(scalar), vec3/color → vec3(vector)).
  const outPort = paramOutputPort(node.paramKind);
  const famHex = portFamilyHex(outPort.type);
  const family = portFamilyOf(outPort.type);
  const familyLabel = family.charAt(0).toUpperCase() + family.slice(1);

  return (
    <div className="inspector-section">
      <div className="inspector-label">Parameter</div>

      <div style={{ marginBottom: 15 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginBottom: 7,
          }}
        >
          Label
        </div>
        <TextField
          value={node.label ?? ""}
          placeholder={`Param ${node.paramKind}`}
          onChange={(e) => setParamLabel(node.id, e.target.value)}
        />
      </div>

      {node.paramKind === "float" && (
        <div className="inspector-row">
          <Slider
            value={typeof node.value === "number" ? node.value : 0}
            min={-2}
            max={2}
            step={0.001}
            onChange={(v) => setParamValue(node.id, v)}
          />
          <NumberField
            value={(typeof node.value === "number" ? node.value : 0).toFixed(3)}
            step={0.01}
            onChange={(v) => setParamValue(node.id, v)}
          />
        </div>
      )}

      {node.paramKind === "vec3" && Array.isArray(node.value) && (
        <MultiSlider
          values={node.value}
          min={-1}
          max={1}
          step={0.001}
          onChange={(next) => setParamValue(node.id, next)}
        />
      )}

      {node.paramKind === "color" && Array.isArray(node.value) && (
        <ColorField
          rgb={node.value}
          onChange={(next) => setParamValue(node.id, next)}
        />
      )}

      {node.paramKind === "time" && (
        <>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 11,
              marginBottom: 4,
            }}
          >
            value = simTime × scale + offset
          </div>
          {TIME_LABELS.map((label, i) => {
            const cur = Array.isArray(node.value) ? node.value : [1, 0];
            const v = cur[i] ?? (i === 0 ? 1 : 0);
            return (
              <div className="inspector-row" key={label}>
                <span
                  style={{
                    width: 48,
                    color: "var(--text-muted)",
                    fontSize: 11,
                  }}
                >
                  {label}
                </span>
                <Slider
                  value={v}
                  min={i === 0 ? -5 : -10}
                  max={i === 0 ? 5 : 10}
                  step={0.01}
                  onChange={(next) => {
                    const nextArr = Array.isArray(node.value)
                      ? node.value.slice()
                      : [1, 0];
                    nextArr[i] = next;
                    setParamValue(node.id, nextArr);
                  }}
                />
                <NumberField
                  value={v.toFixed(3)}
                  step={0.01}
                  onChange={(next) => {
                    const nextArr = Array.isArray(node.value)
                      ? node.value.slice()
                      : [1, 0];
                    nextArr[i] = next;
                    setParamValue(node.id, nextArr);
                  }}
                />
              </div>
            );
          })}
        </>
      )}

      <div
        className="inspector-row"
        style={{ justifyContent: "space-between", marginTop: 4 }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Output type
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: famHex,
            background: withAlpha(famHex, 0.1),
            border: `1px solid ${withAlpha(famHex, 0.3)}`,
            borderRadius: "var(--radius-icon-box)",
            padding: "2px 8px",
          }}
        >
          {outPort.type} · {familyLabel}
        </span>
      </div>
    </div>
  );
}

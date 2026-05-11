import type { ParamGraphNode } from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";

function rgbToHex(rgb: number[]) {
  const c = (v: number | undefined) =>
    Math.round(Math.max(0, Math.min(1, v ?? 0)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export function ParamInspector({ node }: { node: ParamGraphNode }) {
  const setParamValue = useGraphStore((s) => s.setParamValue);
  const setParamLabel = useGraphStore((s) => s.setParamLabel);

  return (
    <div className="inspector-section">
      <div className="inspector-label">Parameter</div>
      <div className="inspector-row">
        <span style={{ width: 36, color: "#888", fontSize: 11 }}>Label</span>
        <input
          type="text"
          value={node.label ?? ""}
          placeholder={`Param ${node.paramKind}`}
          onChange={(e) => setParamLabel(node.id, e.target.value)}
          style={{
            flex: 1,
            background: "#2d2d30",
            border: "1px solid #3a3a3d",
            color: "#ddd",
            padding: "2px 6px",
            borderRadius: 2,
            fontSize: 11,
          }}
        />
      </div>

      {node.paramKind === "float" && (
        <div className="inspector-row">
          <input
            type="range"
            min={-2}
            max={2}
            step={0.001}
            value={typeof node.value === "number" ? node.value : 0}
            onChange={(e) => setParamValue(node.id, parseFloat(e.target.value))}
          />
          <input
            type="number"
            step={0.01}
            value={(typeof node.value === "number" ? node.value : 0).toFixed(3)}
            onChange={(e) =>
              setParamValue(node.id, parseFloat(e.target.value) || 0)
            }
          />
        </div>
      )}

      {node.paramKind === "vec3" &&
        Array.isArray(node.value) &&
        ["x", "y", "z"].map((axis, i) => (
          <div className="inspector-row" key={axis}>
            <span style={{ width: 12, color: "#888", fontFamily: "monospace" }}>
              {axis}
            </span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.001}
              value={(node.value as number[])[i] ?? 0}
              onChange={(e) => {
                const next = (node.value as number[]).slice();
                next[i] = parseFloat(e.target.value);
                setParamValue(node.id, next);
              }}
            />
            <input
              type="number"
              step={0.01}
              value={((node.value as number[])[i] ?? 0).toFixed(3)}
              onChange={(e) => {
                const next = (node.value as number[]).slice();
                next[i] = parseFloat(e.target.value) || 0;
                setParamValue(node.id, next);
              }}
            />
          </div>
        ))}

      {node.paramKind === "color" && Array.isArray(node.value) && (
        <div className="inspector-row">
          <input
            type="color"
            value={rgbToHex(node.value)}
            onChange={(e) =>
              setParamValue(node.id, [...hexToRgb(e.target.value)])
            }
          />
          <span
            style={{ color: "#888", fontFamily: "monospace", fontSize: 11 }}
          >
            {(node.value as number[])
              .slice(0, 3)
              .map((x) => x.toFixed(2))
              .join(", ")}
          </span>
        </div>
      )}

      {node.paramKind === "time" && (
        <>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>
            value = simTime × scale + offset
          </div>
          {["Scale", "Offset"].map((label, i) => (
            <div className="inspector-row" key={label}>
              <span style={{ width: 48, color: "#888", fontSize: 11 }}>
                {label}
              </span>
              <input
                type="range"
                min={i === 0 ? -5 : -10}
                max={i === 0 ? 5 : 10}
                step={0.01}
                value={(Array.isArray(node.value) ? node.value[i] : 0) ?? 0}
                onChange={(e) => {
                  const cur = Array.isArray(node.value)
                    ? node.value.slice()
                    : [1, 0];
                  cur[i] = parseFloat(e.target.value);
                  setParamValue(node.id, cur);
                }}
              />
              <input
                type="number"
                step={0.01}
                value={
                  (Array.isArray(node.value)
                    ? node.value[i]
                    : i === 0
                      ? 1
                      : 0
                  )?.toFixed(3) ?? "0.000"
                }
                onChange={(e) => {
                  const cur = Array.isArray(node.value)
                    ? node.value.slice()
                    : [1, 0];
                  cur[i] = parseFloat(e.target.value) || 0;
                  setParamValue(node.id, cur);
                }}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

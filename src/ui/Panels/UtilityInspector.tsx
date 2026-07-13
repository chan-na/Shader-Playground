import type {
  CombineArity,
  CombineGraphNode,
  GraphNode,
  MathGraphNode,
  MathOp,
  SwizzleGraphNode,
} from "../../core/graph/types";
import { isValidSwizzleMask } from "../../core/nodes/utility";
import { useGraphStore } from "../../state/graphStore";
import { assertNever } from "../../utils/assertNever";
import { NumberField } from "../controls/NumberField";
import { SelectField } from "../controls/SelectField";
import { TextField } from "../controls/TextField";

const MATH_OPS: MathOp[] = [
  "add",
  "subtract",
  "multiply",
  "divide",
  "pow",
  "abs",
  "sin",
  "cos",
];

export function UtilityInspector({ node }: { node: GraphNode }) {
  // Exhaustive over GraphNodeKind so that adding a new kind surfaces here as a
  // compile error via assertNever, instead of silently rendering nothing.
  switch (node.kind) {
    case "math":
      return <MathInspector node={node} />;
    case "swizzle":
      return <SwizzleInspector node={node} />;
    case "combine":
      return <CombineInspector node={node} />;
    case "mesh":
    case "image":
    case "webcam":
    case "video":
    case "audio":
    case "shader":
    case "compute":
    case "output":
    case "param":
    case "group":
      return null;
    default:
      return assertNever(node);
  }
}

function MathInspector({ node }: { node: MathGraphNode }) {
  const setMathConfig = useGraphStore((s) => s.setMathConfig);
  const isUnary = node.op === "abs" || node.op === "sin" || node.op === "cos";
  return (
    <div className="inspector-section">
      <div className="inspector-label">Math operator</div>
      <SelectField
        value={node.op}
        onChange={(e) =>
          setMathConfig(node.id, { op: e.target.value as MathOp })
        }
      >
        {MATH_OPS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </SelectField>
      <div className="inspector-row" style={{ marginTop: 8 }}>
        <span
          style={{
            width: 12,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          a
        </span>
        <NumberField
          value={node.a}
          step={0.01}
          onChange={(v) => setMathConfig(node.id, { a: v })}
        />
      </div>
      {!isUnary && (
        <div className="inspector-row">
          <span
            style={{
              width: 12,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            b
          </span>
          <NumberField
            value={node.b}
            step={0.01}
            onChange={(v) => setMathConfig(node.id, { b: v })}
          />
        </div>
      )}
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
        Default values used when no input edge is connected.
      </div>
    </div>
  );
}

function SwizzleInspector({ node }: { node: SwizzleGraphNode }) {
  const setSwizzleMask = useGraphStore((s) => s.setSwizzleMask);
  const valid = isValidSwizzleMask(node.mask);
  return (
    <div className="inspector-section">
      <div className="inspector-label">Swizzle mask</div>
      <TextField
        mono
        value={node.mask}
        onChange={(e) =>
          setSwizzleMask(
            node.id,
            e.target.value.toLowerCase().replace(/[^xyzw]/g, ""),
          )
        }
        placeholder="xyz"
        maxLength={4}
      />
      <div
        style={{
          color: valid ? "var(--text-muted)" : "var(--error)",
          fontSize: 11,
          marginTop: 4,
        }}
      >
        {valid
          ? `→ ${node.mask.length === 1 ? "float" : `vec${node.mask.length}`}`
          : "Use only x/y/z/w (1–4 chars)"}
      </div>
    </div>
  );
}

function CombineInspector({ node }: { node: CombineGraphNode }) {
  const setCombineConfig = useGraphStore((s) => s.setCombineConfig);
  const channels = ["x", "y", "z", "w"];
  return (
    <div className="inspector-section">
      <div className="inspector-label">Combine arity</div>
      <SelectField
        value={node.arity}
        onChange={(e) =>
          setCombineConfig(node.id, {
            arity: Number(e.target.value) as CombineArity,
          })
        }
      >
        <option value={2}>2 → vec2</option>
        <option value={3}>3 → vec3</option>
        <option value={4}>4 → vec4</option>
      </SelectField>
      {channels.slice(0, node.arity).map((c, i) => (
        <div className="inspector-row" key={c} style={{ marginTop: 6 }}>
          <span
            style={{
              width: 12,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {c}
          </span>
          <NumberField
            value={node.values[i] ?? 0}
            step={0.01}
            onChange={(v) => {
              const next: [number, number, number, number] = [...node.values];
              next[i] = v;
              setCombineConfig(node.id, { values: next });
            }}
          />
        </div>
      ))}
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
        Component defaults used when no input edge is connected.
      </div>
    </div>
  );
}

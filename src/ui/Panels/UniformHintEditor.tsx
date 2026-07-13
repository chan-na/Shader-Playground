import type { CSSProperties } from "react";
import { useState } from "react";
import type { UniformHints, UniformSpec } from "../../core/graph/uniformParser";
import "../controls/controls.css";

export interface UniformHintEditorProps {
  spec: UniformSpec;
  onApply: (hints: UniformHints) => void;
  onClose: () => void;
}

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 10,
  display: "block",
  marginBottom: 2,
};

/**
 * Inline editor that turns the slider's range/default/label into GLSL hint
 * annotations (the inverse of uniformParser). Vector controls take a
 * comma-separated default; scalars take a single number.
 */
export function UniformHintEditor({
  spec,
  onApply,
  onClose,
}: UniformHintEditorProps) {
  const isVec = spec.control === "multi" || spec.control === "color";
  const [min, setMin] = useState(String(spec.min));
  const [max, setMax] = useState(String(spec.max));
  const [step, setStep] = useState(String(spec.step));
  const [label, setLabel] = useState(spec.label ?? "");
  const [def, setDef] = useState(
    Array.isArray(spec.defaultValue)
      ? spec.defaultValue.join(", ")
      : String(spec.defaultValue),
  );

  const apply = () => {
    const hints: UniformHints = {};
    const minN = parseFloat(min);
    const maxN = parseFloat(max);
    const stepN = parseFloat(step);
    if (!Number.isNaN(minN)) hints.min = minN;
    if (!Number.isNaN(maxN)) hints.max = maxN;
    if (!Number.isNaN(stepN) && stepN > 0) hints.step = stepN;

    const labelTrim = label.trim();
    if (labelTrim) hints.label = labelTrim;

    if (isVec) {
      const parts = def
        .split(/[ ,]+/)
        .map((s) => parseFloat(s))
        .filter((n) => !Number.isNaN(n));
      if (parts.length) hints.defaultValue = parts;
    } else {
      const dn = parseFloat(def);
      if (!Number.isNaN(dn)) hints.defaultValue = dn;
    }

    // Preserve an explicit vector control so re-parsing the source doesn't let
    // name-based inference flip color↔multi after the edit.
    if (
      (spec.type === "vec3" || spec.type === "vec4") &&
      (spec.control === "color" || spec.control === "multi")
    ) {
      hints.control = spec.control;
    }

    onApply(hints);
  };

  return (
    <div
      data-testid="uniform-hint-editor"
      style={{
        marginTop: 6,
        padding: 8,
        background: "var(--surface-panel)",
        border: "1px solid var(--border-strong)",
        // design/Side Panel.dc.html doesn't mock this popover explicitly;
        // no tokens.radius entry matches 4, so it keeps the literal value
        // (iconBox at 5 is the nearest named radius).
        borderRadius: 4,
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle} htmlFor={`hint-min-${spec.name}`}>
            min
          </label>
          <input
            id={`hint-min-${spec.name}`}
            data-testid="uniform-hint-min"
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="ctl-text ctl-text--sm"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle} htmlFor={`hint-max-${spec.name}`}>
            max
          </label>
          <input
            id={`hint-max-${spec.name}`}
            data-testid="uniform-hint-max"
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="ctl-text ctl-text--sm"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle} htmlFor={`hint-step-${spec.name}`}>
            step
          </label>
          <input
            id={`hint-step-${spec.name}`}
            data-testid="uniform-hint-step"
            type="number"
            value={step}
            onChange={(e) => setStep(e.target.value)}
            className="ctl-text ctl-text--sm"
          />
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <label style={labelStyle} htmlFor={`hint-default-${spec.name}`}>
          default{isVec ? " (comma-separated)" : ""}
        </label>
        <input
          id={`hint-default-${spec.name}`}
          data-testid="uniform-hint-default"
          type="text"
          value={def}
          onChange={(e) => setDef(e.target.value)}
          className="ctl-text ctl-text--sm"
        />
      </div>

      <div style={{ marginTop: 6 }}>
        <label style={labelStyle} htmlFor={`hint-label-${spec.name}`}>
          label
        </label>
        <input
          id={`hint-label-${spec.name}`}
          data-testid="uniform-hint-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="ctl-text ctl-text--sm"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 8,
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          data-testid="uniform-hint-cancel"
          onClick={onClose}
          className="ctl-btn ctl-btn--ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="uniform-hint-apply"
          onClick={apply}
          className="ctl-btn ctl-btn--primary"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

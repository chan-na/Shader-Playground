import type { UniformSpec } from "../../core/graph/uniformParser";
import { ColorField } from "../controls/ColorField";
import { MultiSlider } from "../controls/MultiSlider";
import { NumberField } from "../controls/NumberField";
import { Slider } from "../controls/Slider";
import { Toggle } from "../controls/Toggle";

export interface UniformControlProps {
  spec: UniformSpec;
  value: number | number[] | undefined;
  onChange: (v: number | number[]) => void;
  /**
   * [L1/E-4] Name of the node feeding this uniform via a graph edge
   * (Inspector resolves it from `graphStore.edges` — see Inspector.tsx).
   * When present, `execute.ts`'s `bindUserUniforms` overwrites whatever this
   * control would send with the edge's live value every frame, so the
   * control is disabled and a note explains why instead of letting the
   * slider silently do nothing.
   */
  drivenBy?: string;
}

function stepFor(spec: UniformSpec): number {
  if (spec.step && spec.step > 0) return spec.step;
  const range = spec.max - spec.min;
  return range > 0 ? range / 1000 : 0.001;
}

export function UniformControl({
  spec,
  value,
  onChange,
  drivenBy,
}: UniformControlProps) {
  const v = value ?? spec.defaultValue;
  const step = stepFor(spec);
  const disabled = drivenBy !== undefined;

  const drivenNote = disabled ? (
    <div
      data-testid="uniform-driven-note"
      style={{
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        color: "var(--text-muted)",
        marginTop: 4,
      }}
    >
      driven by {drivenBy} — 슬라이더 값은 무시됩니다
    </div>
  ) : null;

  if (spec.control === "slider") {
    const num = typeof v === "number" ? v : 0;
    return (
      <div>
        <div className="inspector-row">
          <Slider
            value={num}
            min={spec.min}
            max={spec.max}
            step={step}
            showRange
            disabled={disabled}
            onChange={onChange}
          />
          <NumberField
            value={num.toFixed(3)}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
        {drivenNote}
      </div>
    );
  }

  if (spec.control === "multi") {
    const arr = Array.isArray(v)
      ? v
      : Array.isArray(spec.defaultValue)
        ? spec.defaultValue
        : [];
    return (
      <div>
        <MultiSlider
          values={arr}
          min={spec.min}
          max={spec.max}
          step={step}
          disabled={disabled}
          onChange={onChange}
        />
        {drivenNote}
      </div>
    );
  }

  if (spec.control === "color") {
    const arr = Array.isArray(v)
      ? v
      : Array.isArray(spec.defaultValue)
        ? spec.defaultValue
        : [];
    return (
      <div>
        <ColorField rgb={arr} disabled={disabled} onChange={onChange} />
        {drivenNote}
      </div>
    );
  }

  if (spec.control === "bool") {
    const num = typeof v === "number" ? v : 0;
    return (
      <div>
        <Toggle
          checked={num > 0.5}
          disabled={disabled}
          onChange={(b) => onChange(b ? 1 : 0)}
        />
        {drivenNote}
      </div>
    );
  }

  return null;
}

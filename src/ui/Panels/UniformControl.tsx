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
}

function stepFor(spec: UniformSpec): number {
  if (spec.step && spec.step > 0) return spec.step;
  const range = spec.max - spec.min;
  return range > 0 ? range / 1000 : 0.001;
}

export function UniformControl({ spec, value, onChange }: UniformControlProps) {
  const v = value ?? spec.defaultValue;
  const step = stepFor(spec);

  if (spec.control === "slider") {
    const num = typeof v === "number" ? v : 0;
    return (
      <div className="inspector-row">
        <Slider
          value={num}
          min={spec.min}
          max={spec.max}
          step={step}
          showRange
          onChange={onChange}
        />
        <NumberField value={num.toFixed(3)} onChange={onChange} />
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
      <MultiSlider
        values={arr}
        min={spec.min}
        max={spec.max}
        step={step}
        onChange={onChange}
      />
    );
  }

  if (spec.control === "color") {
    const arr = Array.isArray(v)
      ? v
      : Array.isArray(spec.defaultValue)
        ? spec.defaultValue
        : [];
    return <ColorField rgb={arr} onChange={onChange} />;
  }

  if (spec.control === "bool") {
    const num = typeof v === "number" ? v : 0;
    return <Toggle checked={num > 0.5} onChange={(b) => onChange(b ? 1 : 0)} />;
  }

  return null;
}

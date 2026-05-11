import type { UniformSpec } from '../../core/graph/uniformParser';

export interface UniformControlProps {
  spec: UniformSpec;
  value: number | number[] | undefined;
  onChange: (v: number | number[]) => void;
}

export function UniformControl({ spec, value, onChange }: UniformControlProps) {
  const v = value ?? spec.defaultValue;

  if (spec.control === 'slider') {
    const num = typeof v === 'number' ? v : 0;
    return (
      <div className="inspector-row">
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={(spec.max - spec.min) / 1000}
          value={num}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          step={(spec.max - spec.min) / 1000}
          value={num.toFixed(3)}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    );
  }

  if (spec.control === 'multi') {
    const arr = Array.isArray(v) ? v : (spec.defaultValue as number[]);
    const labels = ['x', 'y', 'z', 'w'];
    return (
      <div>
        {arr.map((component, i) => (
          <div className="inspector-row" key={i}>
            <span style={{ width: 12, color: '#888', fontFamily: 'monospace' }}>{labels[i]}</span>
            <input
              type="range"
              min={spec.min}
              max={spec.max}
              step={(spec.max - spec.min) / 1000}
              value={component}
              onChange={(e) => {
                const next = arr.slice();
                next[i] = parseFloat(e.target.value);
                onChange(next);
              }}
            />
            <input
              type="number"
              step={(spec.max - spec.min) / 1000}
              value={component.toFixed(3)}
              onChange={(e) => {
                const next = arr.slice();
                next[i] = parseFloat(e.target.value);
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (spec.control === 'color') {
    const arr = Array.isArray(v) ? v : (spec.defaultValue as number[]);
    const r = Math.round(Math.max(0, Math.min(1, arr[0] ?? 0)) * 255);
    const g = Math.round(Math.max(0, Math.min(1, arr[1] ?? 0)) * 255);
    const b = Math.round(Math.max(0, Math.min(1, arr[2] ?? 0)) * 255);
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return (
      <div className="inspector-row">
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            const rr = parseInt(v.slice(1, 3), 16) / 255;
            const gg = parseInt(v.slice(3, 5), 16) / 255;
            const bb = parseInt(v.slice(5, 7), 16) / 255;
            const next = arr.slice();
            next[0] = rr;
            next[1] = gg;
            next[2] = bb;
            onChange(next);
          }}
        />
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
          {arr.slice(0, 3).map((x) => x.toFixed(2)).join(', ')}
        </span>
      </div>
    );
  }

  if (spec.control === 'bool') {
    const num = typeof v === 'number' ? v : 0;
    return (
      <div className="inspector-row">
        <input
          type="checkbox"
          checked={num > 0.5}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
        />
      </div>
    );
  }

  return null;
}

import { hexToRgb, rgbToHex } from "./colorConvert";
import "./controls.css";

export interface ColorFieldProps {
  rgb: readonly number[];
  onChange: (next: number[]) => void;
  dataTestId?: string;
  id?: string;
}

/** Swatch + hex chip pair (design/Side Panel.dc.html L92, L264). The
 * native `<input type="color">` is an invisible overlay on top of the
 * swatch so the whole 30x30 square is clickable, matching the mock's
 * visual while keeping the OS color picker as the actual UI.
 *
 * `onChange` preserves UniformControl's original color semantic: only
 * channels [0..2] are replaced (an alpha/4th component, if present, is
 * carried through unchanged). */
export function ColorField({ rgb, onChange, dataTestId, id }: ColorFieldProps) {
  const hex = rgbToHex(rgb);

  return (
    <div className="ctl-color">
      <span className="ctl-color-swatch" style={{ background: hex }}>
        <input
          id={id}
          type="color"
          className="ctl-color-input"
          value={hex}
          aria-label="color"
          data-testid={dataTestId}
          onChange={(e) => {
            const [r, g, b] = hexToRgb(e.target.value);
            const next = rgb.slice();
            next[0] = r;
            next[1] = g;
            next[2] = b;
            onChange(next);
          }}
        />
      </span>
      <span className="ctl-color-hex">{hex.toUpperCase()}</span>
    </div>
  );
}

import "./controls.css";

interface SegmentedControlOption {
  value: string;
  label: string;
  dataTestId?: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

/**
 * Segmented button group (design/Side Panel.dc.html L231's "Solid / Wire /
 * Points" control-library sample). First consumer: AudioInspector's
 * mic/file source switch (M5-U3).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps) {
  return (
    <fieldset className="ctl-segmented" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={
              active
                ? "ctl-segmented-btn ctl-segmented-btn--active"
                : "ctl-segmented-btn"
            }
            aria-pressed={active}
            data-testid={opt.dataTestId}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </fieldset>
  );
}

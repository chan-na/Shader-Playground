import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberField } from "./NumberField";

afterEach(() => {
  cleanup();
});

/**
 * Stand-in for the real callers (UniformControl / ParamInspector /
 * MultiSlider): they feed the field a *formatted* string derived from the
 * value it last committed. Without that loop a local draft would look like it
 * works while the actual regression (#14) — the commit bouncing a formatted
 * number back down and clobbering the in-progress text — goes untested.
 */
function Controlled({
  initial = 0,
  onCommit,
}: {
  initial?: number;
  onCommit?: (v: number) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <NumberField
      value={v.toFixed(3)}
      onChange={(n) => {
        onCommit?.(n);
        setV(n);
      }}
    />
  );
}

function spin(): HTMLInputElement {
  return screen.getByRole("spinbutton") as HTMLInputElement;
}

describe("NumberField", () => {
  it("renders a native number input with the given value", () => {
    render(<NumberField value="1.500" onChange={() => {}} />);
    const input = spin();
    expect(input.type).toBe("number");
    expect(input.value).toBe("1.500");
  });

  it("parses a well-formed numeric string on change", () => {
    let received: number | undefined;
    render(
      <NumberField
        value="0"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.change(spin(), { target: { value: "3.25" } });
    expect(received).toBe(3.25);
  });

  // [#14] Contract change, deliberate: this used to assert `received === 0`
  // ("commits 0 for a non-numeric input"). That semantic was an artifact of
  // `parseFloat(x) || 0` and is exactly the defect — an in-progress entry
  // pushed 0 into the store, which came back as "0.000" and erased what was
  // being typed. A non-numeric entry now commits nothing; blur restores the
  // last good value (see below). To zero a value, type 0.
  it("commits nothing for a non-numeric input — the draft is held instead", () => {
    let received: number | undefined;
    render(
      <NumberField
        value="0"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.change(spin(), { target: { value: "" } });
    expect(received).toBeUndefined();
  });

  it("applies an explicit pixel width via inline style", () => {
    render(<NumberField value="0" width={48} onChange={() => {}} />);
    expect(spin().style.width).toBe("48px");
  });
});

// [#14] `<input type="number">` runs the HTML value-sanitization algorithm:
// while the text is not a valid floating-point number the `value` IDL
// attribute reads back as "". So "-" and "0." both reach the change handler
// as "" — and the whole point of the draft is that we echo that "" back
// unchanged, which is what lets the browser keep showing the partial text.
// The old code turned it into a 0 commit, so the field re-rendered as
// "0.000" and the entry was destroyed mid-keystroke.
describe("NumberField — partial entry (#14)", () => {
  it("typing '-' then '5' commits -5 and never commits an intermediate 0", () => {
    const commits: number[] = [];
    render(<Controlled onCommit={(n) => commits.push(n)} />);
    const input = spin();

    fireEvent.change(input, { target: { value: "-" } });
    expect(commits).toEqual([]);

    fireEvent.change(input, { target: { value: "-5" } });
    expect(commits).toEqual([-5]);
  });

  it("leaves the DOM value alone while '-' is being typed", () => {
    render(<Controlled />);
    const input = spin();
    expect(input.value).toBe("0.000");

    fireEvent.change(input, { target: { value: "-" } });
    // The sanitized partial, not a formatted number bounced back down.
    expect(input.value).toBe("");
  });

  it("leaves the DOM value alone while '0.' is being typed", () => {
    render(<Controlled initial={1} />);
    const input = spin();
    expect(input.value).toBe("1.000");

    fireEvent.change(input, { target: { value: "0." } });
    expect(input.value).toBe("");
  });

  it("blur snaps an abandoned partial back to the external value", () => {
    render(<NumberField value="1.500" onChange={() => {}} />);
    const input = spin();

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.blur(input);
    expect(input.value).toBe("1.500");
  });
});

describe("NumberField — external re-sync (#14)", () => {
  it("adopts an external value change (slider drag, undo)", () => {
    const { rerender } = render(
      <NumberField value="0.500" onChange={() => {}} />,
    );
    rerender(<NumberField value="1.750" onChange={() => {}} />);
    expect(spin().value).toBe("1.750");
  });

  it("keeps the typed text when the echo is only a reformat of it", () => {
    const { rerender } = render(
      <NumberField value="0.000" onChange={() => {}} />,
    );
    fireEvent.change(spin(), { target: { value: "1.7" } });
    // What UniformControl feeds back after committing 1.7.
    rerender(<NumberField value="1.700" onChange={() => {}} />);
    expect(spin().value).toBe("1.7");
  });
});

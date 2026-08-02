import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { tokens } from "../../theme";
import { MultiSlider } from "./MultiSlider";

afterEach(() => {
  cleanup();
});

/** jsdom (like browsers) normalizes an inline `style.color = "#rrggbb"` to
 * `rgb(r, g, b)` when read back — compare against that normalized form
 * rather than the literal hex token string. */
function hexToRgbString(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe("MultiSlider", () => {
  it("renders one row per value", () => {
    render(
      <MultiSlider
        values={[0.1, 0.2, 0.3]}
        min={-1}
        max={1}
        step={0.01}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
  });

  it("colors the x/y/z axis labels per tokens.semantic.error / portFamily.scalar / accent.default", () => {
    render(
      <MultiSlider
        values={[0.1, 0.2, 0.3]}
        min={-1}
        max={1}
        step={0.01}
        onChange={() => {}}
      />,
    );
    const labels = screen.getAllByText(/^[xyz]$/);
    expect(labels).toHaveLength(3);
    expect(labels[0]?.style.color).toBe(hexToRgbString(tokens.semantic.error));
    expect(labels[1]?.style.color).toBe(
      hexToRgbString(tokens.portFamily.scalar),
    );
    expect(labels[2]?.style.color).toBe(hexToRgbString(tokens.accent.default));
  });

  it("changing axis 1 (y) copies the array and replaces only that index", () => {
    const original = [0.1, 0.2, 0.3];
    let received: number[] | undefined;
    render(
      <MultiSlider
        values={original}
        min={-1}
        max={1}
        step={0.01}
        onChange={(next) => {
          received = next;
        }}
      />,
    );
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[1] as HTMLInputElement, {
      target: { value: "0.75" },
    });

    expect(received).toEqual([0.1, 0.75, 0.3]);
    // Original array is untouched (non-mutating update).
    expect(original).toEqual([0.1, 0.2, 0.3]);
  });

  it("changing the number field for an axis produces the same replace-in-copy result", () => {
    const original = [0.1, 0.2, 0.3];
    let received: number[] | undefined;
    render(
      <MultiSlider
        values={original}
        min={-1}
        max={1}
        step={0.01}
        onChange={(next) => {
          received = next;
        }}
      />,
    );
    const fields = screen.getAllByRole("spinbutton");
    fireEvent.change(fields[2] as HTMLInputElement, {
      target: { value: "0.9" },
    });

    expect(received).toEqual([0.1, 0.2, 0.9]);
    expect(original).toEqual([0.1, 0.2, 0.3]);
  });

  // [L1/E-4] Driven-uniform disable propagates to every axis's Slider and
  // NumberField.
  describe("disabled", () => {
    it("disables every slider and number field for each axis", () => {
      render(
        <MultiSlider
          values={[0.1, 0.2, 0.3]}
          min={-1}
          max={1}
          step={0.01}
          disabled
          onChange={() => {}}
        />,
      );
      for (const slider of screen.getAllByRole(
        "slider",
      ) as HTMLInputElement[]) {
        expect(slider.disabled).toBe(true);
      }
      for (const field of screen.getAllByRole(
        "spinbutton",
      ) as HTMLInputElement[]) {
        expect(field.disabled).toBe(true);
      }
    });

    it("is enabled by default", () => {
      render(
        <MultiSlider
          values={[0.1, 0.2, 0.3]}
          min={-1}
          max={1}
          step={0.01}
          onChange={() => {}}
        />,
      );
      for (const slider of screen.getAllByRole(
        "slider",
      ) as HTMLInputElement[]) {
        expect(slider.disabled).toBe(false);
      }
    });
  });
});

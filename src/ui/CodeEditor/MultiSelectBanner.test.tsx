import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiSelectBanner } from "./MultiSelectBanner";

afterEach(() => {
  cleanup();
});

describe("MultiSelectBanner", () => {
  it("renders the count text and the code-multi-select-banner testid", () => {
    render(
      <MultiSelectBanner
        count={3}
        chips={[
          { id: "shader-1", label: "Fresnel", hasError: false },
          { id: "shader-2", label: "Blend", hasError: false },
          { id: "compute-1", label: "Particles", hasError: false },
        ]}
      />,
    );
    expect(screen.getByTestId("code-multi-select-banner")).not.toBeNull();
    expect(screen.getByText("3 nodes selected")).not.toBeNull();
  });

  it("renders one chip per entry showing the display-name label, not the raw id", () => {
    const chips = [
      { id: "shader-1", label: "Fresnel", hasError: false },
      { id: "shader-2", label: "Blend", hasError: false },
      { id: "compute-1", label: "Particles", hasError: false },
    ];
    render(<MultiSelectBanner count={chips.length} chips={chips} />);
    for (const chip of chips) {
      expect(screen.getByText(chip.label)).not.toBeNull();
      expect(screen.queryByText(chip.id)).toBeNull();
    }
  });

  it("renders the error dot only for chips with hasError=true", () => {
    render(
      <MultiSelectBanner
        count={2}
        chips={[
          { id: "shader-ok", label: "OK Pass", hasError: false },
          { id: "shader-broken", label: "Broken Pass", hasError: true },
        ]}
      />,
    );
    const errorDots = screen.getAllByLabelText("has errors");
    expect(errorDots).toHaveLength(1);
    expect(errorDots[0]?.parentElement?.textContent).toContain("Broken Pass");
  });

  it("shows the single-node guidance copy", () => {
    render(<MultiSelectBanner count={2} chips={[]} />);
    expect(screen.getByText(/Select a single node/i)).not.toBeNull();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Slider } from "./Slider";

afterEach(() => {
  cleanup();
});

describe("Slider", () => {
  it("passes min/max/step through to the native range input", () => {
    render(
      <Slider value={0.5} min={0} max={2} step={0.01} onChange={() => {}} />,
    );
    const input = screen.getByRole("slider");
    expect(input.getAttribute("min")).toBe("0");
    expect(input.getAttribute("max")).toBe("2");
    expect(input.getAttribute("step")).toBe("0.01");
    expect(input.getAttribute("type")).toBe("range");
  });

  it("fires onChange with a parsed number on a native change event", () => {
    let received: number | undefined;
    render(
      <Slider
        value={0.5}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "1.25" },
    });
    expect(received).toBe(1.25);
  });

  it("computes --ctl-fill as 0% when value is at min", () => {
    render(
      <Slider value={0} min={0} max={2} step={0.01} onChange={() => {}} />,
    );
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.style.getPropertyValue("--ctl-fill")).toBe("0%");
  });

  it("computes --ctl-fill as 0% (not NaN/negative) when max <= min", () => {
    render(
      <Slider value={5} min={3} max={3} step={0.01} onChange={() => {}} />,
    );
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.style.getPropertyValue("--ctl-fill")).toBe("0%");
  });

  it("computes --ctl-fill as 50% at the midpoint", () => {
    render(
      <Slider value={1} min={0} max={2} step={0.01} onChange={() => {}} />,
    );
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.style.getPropertyValue("--ctl-fill")).toBe("50%");
  });

  it("renders the min/max caption row when showRange is set", () => {
    render(
      <Slider
        value={1}
        min={0}
        max={2}
        step={0.01}
        onChange={() => {}}
        showRange
      />,
    );
    expect(screen.getByText("0")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
  });

  it("omits the caption row by default", () => {
    const { container } = render(
      <Slider value={1} min={0} max={2} step={0.01} onChange={() => {}} />,
    );
    expect(container.querySelector(".ctl-slider-range")).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ColorField } from "./ColorField";

afterEach(() => {
  cleanup();
});

describe("ColorField", () => {
  it("renders the hex chip in uppercase form", () => {
    render(<ColorField rgb={[1, 0, 0]} onChange={() => {}} />);
    expect(screen.getByText("#FF0000")).not.toBeNull();
  });

  it("renders a native input[type=color] with the matching lowercase value", () => {
    const { container } = render(
      <ColorField rgb={[1, 0, 0]} onChange={() => {}} />,
    );
    const input = container.querySelector(
      "input[type='color']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("#ff0000");
  });

  it("replaces channels [0..2] and preserves a 4th component on change", () => {
    let received: number[] | undefined;
    const { container } = render(
      <ColorField
        rgb={[1, 0, 0, 0.5]}
        onChange={(next) => {
          received = next;
        }}
      />,
    );
    const input = container.querySelector(
      "input[type='color']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#00ff00" } });

    expect(received).toBeDefined();
    const [r, g, b, a] = received as number[];
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0, 2);
    expect(a).toBe(0.5);
  });

  it("attaches dataTestId to the native color input", () => {
    render(
      <ColorField
        rgb={[0, 0, 0]}
        onChange={() => {}}
        dataTestId="uniform-color"
      />,
    );
    const input = screen.getByTestId("uniform-color");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("color");
  });
});

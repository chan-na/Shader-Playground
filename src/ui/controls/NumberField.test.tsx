import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberField } from "./NumberField";

afterEach(() => {
  cleanup();
});

describe("NumberField", () => {
  it("renders a native number input with the given value", () => {
    render(<NumberField value="1.500" onChange={() => {}} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
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
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "3.25" },
    });
    expect(received).toBe(3.25);
  });

  it("commits 0 for a non-numeric input (existing UniformControl semantic)", () => {
    let received: number | undefined;
    render(
      <NumberField
        value="0"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "" },
    });
    expect(received).toBe(0);
  });

  it("applies an explicit pixel width via inline style", () => {
    render(<NumberField value="0" width={48} onChange={() => {}} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.style.width).toBe("48px");
  });
});

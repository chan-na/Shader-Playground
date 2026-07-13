import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toggle } from "./Toggle";

afterEach(() => {
  cleanup();
});

describe("Toggle", () => {
  it("renders a role=switch button reflecting aria-checked", () => {
    render(<Toggle checked={false} onChange={() => {}} />);
    const el = screen.getByRole("switch");
    expect(el.getAttribute("aria-checked")).toBe("false");
  });

  it("reflects checked=true as aria-checked=true", () => {
    render(<Toggle checked onChange={() => {}} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("calls onChange with the flipped value on click", () => {
    let received: boolean | undefined;
    render(
      <Toggle
        checked={false}
        onChange={(next) => {
          received = next;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(received).toBe(true);
  });

  it("does not call onChange when disabled", () => {
    let calls = 0;
    render(
      <Toggle
        checked={false}
        disabled
        onChange={() => {
          calls += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(calls).toBe(0);
  });
});

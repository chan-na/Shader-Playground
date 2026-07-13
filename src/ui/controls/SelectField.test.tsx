import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SelectField } from "./SelectField";

afterEach(() => {
  cleanup();
});

describe("SelectField", () => {
  it("renders a native select with the given options and value", () => {
    render(
      <SelectField value="0.5" onChange={() => {}} dataTestId="my-select">
        <option value="0.25">0.25×</option>
        <option value="0.5">0.5×</option>
        <option value="1">1× (full)</option>
      </SelectField>,
    );
    const select = screen.getByTestId("my-select") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("0.5");
    expect(
      screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value),
    ).toEqual(["0.25", "0.5", "1"]);
  });

  it("fires onChange with the selected value", () => {
    let received: string | undefined;
    render(
      <SelectField
        value="1"
        onChange={(e) => {
          received = e.target.value;
        }}
        dataTestId="my-select"
      >
        <option value="0.25">0.25×</option>
        <option value="1">1× (full)</option>
      </SelectField>,
    );
    fireEvent.change(screen.getByTestId("my-select"), {
      target: { value: "0.25" },
    });
    expect(received).toBe("0.25");
  });

  it("renders the caret span", () => {
    const { container } = render(
      <SelectField value="1" onChange={() => {}}>
        <option value="1">1</option>
      </SelectField>,
    );
    const caret = container.querySelector(".ctl-select-caret");
    expect(caret).not.toBeNull();
    expect(caret?.textContent).toBe("▾");
  });
});

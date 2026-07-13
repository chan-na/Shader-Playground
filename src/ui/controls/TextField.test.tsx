import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextField } from "./TextField";

afterEach(() => {
  cleanup();
});

describe("TextField", () => {
  it("renders a native text input with the given value and placeholder", () => {
    render(
      <TextField
        value="hello"
        placeholder="Filter…"
        onChange={() => {}}
        dataTestId="my-text"
      />,
    );
    const input = screen.getByTestId("my-text") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
    expect(input.value).toBe("hello");
    expect(input.placeholder).toBe("Filter…");
  });

  it("fires onChange while typing", () => {
    let received: string | undefined;
    render(
      <TextField
        value=""
        onChange={(e) => {
          received = e.target.value;
        }}
        dataTestId="my-text"
      />,
    );
    fireEvent.change(screen.getByTestId("my-text"), {
      target: { value: "blur" },
    });
    expect(received).toBe("blur");
  });

  it("passes type='search' through to the native input", () => {
    render(
      <TextField
        type="search"
        value=""
        onChange={() => {}}
        dataTestId="my-search"
      />,
    );
    const input = screen.getByTestId("my-search") as HTMLInputElement;
    expect(input.type).toBe("search");
  });
});

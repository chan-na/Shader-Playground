import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "mic", label: "Microphone", dataTestId: "seg-mic" },
  { value: "file", label: "File", dataTestId: "seg-file" },
];

describe("SegmentedControl", () => {
  it("renders one button per option with its label", () => {
    render(
      <SegmentedControl options={OPTIONS} value="mic" onChange={() => {}} />,
    );
    expect(screen.getByText("Microphone")).not.toBeNull();
    expect(screen.getByText("File")).not.toBeNull();
  });

  it("marks the active option's button aria-pressed=true and the rest false", () => {
    render(
      <SegmentedControl options={OPTIONS} value="mic" onChange={() => {}} />,
    );
    expect(screen.getByTestId("seg-mic").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("seg-file").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("clicking an inactive option calls onChange with its value", () => {
    let received: string | undefined;
    render(
      <SegmentedControl
        options={OPTIONS}
        value="mic"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("seg-file"));
    expect(received).toBe("file");
  });

  it("attaches each option's dataTestId to its own button", () => {
    render(
      <SegmentedControl options={OPTIONS} value="file" onChange={() => {}} />,
    );
    expect(screen.getByTestId("seg-mic").textContent).toBe("Microphone");
    expect(screen.getByTestId("seg-file").textContent).toBe("File");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { useViewportStore } from "./viewportStore";

describe("viewportStore", () => {
  beforeEach(() => {
    useViewportStore.setState({
      background: [0.07, 0.07, 0.09],
      rev: 0,
    });
  });

  it("setBackground updates the colour and bumps rev", () => {
    const before = useViewportStore.getState().rev;
    useViewportStore.getState().setBackground([1, 0.5, 0.25]);
    const after = useViewportStore.getState();
    expect(after.background).toEqual([1, 0.5, 0.25]);
    expect(after.rev).toBe(before + 1);
  });
});

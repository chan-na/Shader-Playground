import { beforeEach, describe, expect, it } from "vitest";
import { mouseVec4, useMouseStore } from "./mouseStore";

describe("mouseStore", () => {
  beforeEach(() => {
    useMouseStore.getState().reset();
  });

  it("setPosition updates xy and bumps rev (wakes RAF from idle)", () => {
    const before = useMouseStore.getState().rev;
    useMouseStore.getState().setPosition(120, 80);
    const s = useMouseStore.getState();
    expect(s.x).toBe(120);
    expect(s.y).toBe(80);
    expect(s.rev).toBe(before + 1);
    // A bare move does not register a click.
    expect(s.clickX).toBe(0);
    expect(s.clickY).toBe(0);
    expect(s.down).toBe(false);
  });

  it("setDown records the click position and sets down", () => {
    const before = useMouseStore.getState().rev;
    useMouseStore.getState().setDown(40, 200);
    const s = useMouseStore.getState();
    expect(s.x).toBe(40);
    expect(s.y).toBe(200);
    expect(s.clickX).toBe(40);
    expect(s.clickY).toBe(200);
    expect(s.down).toBe(true);
    expect(s.rev).toBe(before + 1);
  });

  it("click position persists across moves until the next press", () => {
    useMouseStore.getState().setDown(10, 20);
    useMouseStore.getState().setPosition(300, 400);
    const s = useMouseStore.getState();
    expect(s.x).toBe(300);
    expect(s.y).toBe(400);
    expect(s.clickX).toBe(10);
    expect(s.clickY).toBe(20);
  });

  it("setUp clears down and bumps rev", () => {
    useMouseStore.getState().setDown(5, 5);
    const before = useMouseStore.getState().rev;
    useMouseStore.getState().setUp();
    const s = useMouseStore.getState();
    expect(s.down).toBe(false);
    expect(s.rev).toBe(before + 1);
  });

  it("mouseVec4 packs current position into xy and click into zw", () => {
    useMouseStore.getState().setDown(11, 22);
    useMouseStore.getState().setPosition(33, 44);
    expect(mouseVec4(useMouseStore.getState())).toEqual([33, 44, 11, 22]);
  });

  it("reset clears all coordinates and bumps rev", () => {
    useMouseStore.getState().setDown(1, 2);
    useMouseStore.getState().setPosition(3, 4);
    const before = useMouseStore.getState().rev;
    useMouseStore.getState().reset();
    const s = useMouseStore.getState();
    expect(s).toMatchObject({
      x: 0,
      y: 0,
      clickX: 0,
      clickY: 0,
      down: false,
    });
    expect(s.rev).toBe(before + 1);
  });
});

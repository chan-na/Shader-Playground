import { beforeEach, describe, expect, it } from "vitest";
import { useLayoutStore } from "./layoutStore";

const initial = useLayoutStore.getState();

beforeEach(() => {
  useLayoutStore.setState(initial, true);
});

describe("layoutStore defaults", () => {
  it("starts with the App Shell design ratios", () => {
    const s = useLayoutStore.getState();
    expect(s.leftFrac).toBeCloseTo(0.587, 3);
    expect(s.viewportFrac).toBeCloseTo(0.556, 3);
    expect(s.codeHeight).toBe(232);
  });
});

describe("setLeftFrac", () => {
  it("clamps below the 0.2 floor", () => {
    useLayoutStore.getState().setLeftFrac(0.1);
    expect(useLayoutStore.getState().leftFrac).toBeCloseTo(0.2, 5);
  });

  it("clamps above the 0.8 ceiling", () => {
    useLayoutStore.getState().setLeftFrac(0.95);
    expect(useLayoutStore.getState().leftFrac).toBeCloseTo(0.8, 5);
  });

  it("accepts values within range unchanged", () => {
    useLayoutStore.getState().setLeftFrac(0.4);
    expect(useLayoutStore.getState().leftFrac).toBeCloseTo(0.4, 5);
  });
});

describe("setViewportFrac", () => {
  it("clamps below the 0.2 floor", () => {
    useLayoutStore.getState().setViewportFrac(0.1);
    expect(useLayoutStore.getState().viewportFrac).toBeCloseTo(0.2, 5);
  });

  it("clamps above the 0.8 ceiling", () => {
    useLayoutStore.getState().setViewportFrac(0.95);
    expect(useLayoutStore.getState().viewportFrac).toBeCloseTo(0.8, 5);
  });

  it("accepts values within range unchanged", () => {
    useLayoutStore.getState().setViewportFrac(0.65);
    expect(useLayoutStore.getState().viewportFrac).toBeCloseTo(0.65, 5);
  });
});

describe("setCodeHeight", () => {
  it("clamps below the 120px floor", () => {
    useLayoutStore.getState().setCodeHeight(50);
    expect(useLayoutStore.getState().codeHeight).toBe(120);
  });

  it("clamps above the 640px ceiling", () => {
    useLayoutStore.getState().setCodeHeight(9999);
    expect(useLayoutStore.getState().codeHeight).toBe(640);
  });

  it("accepts values within range unchanged", () => {
    useLayoutStore.getState().setCodeHeight(300);
    expect(useLayoutStore.getState().codeHeight).toBe(300);
  });
});

describe("collapsed/maximized defaults", () => {
  it("starts with every panel expanded and nothing maximized", () => {
    const s = useLayoutStore.getState();
    expect(s.collapsed).toEqual({
      nodeEditor: false,
      viewport: false,
      sidePanel: false,
      codeEditor: false,
    });
    expect(s.maximized).toBeNull();
  });
});

describe("toggleCollapsed", () => {
  it("round-trips a single panel's collapsed flag without touching others", () => {
    useLayoutStore.getState().toggleCollapsed("viewport");
    expect(useLayoutStore.getState().collapsed).toEqual({
      nodeEditor: false,
      viewport: true,
      sidePanel: false,
      codeEditor: false,
    });
    useLayoutStore.getState().toggleCollapsed("viewport");
    expect(useLayoutStore.getState().collapsed.viewport).toBe(false);
  });
});

describe("toggleMaximized", () => {
  it("maximizes a panel, then restores (null) on a second call for the same id", () => {
    useLayoutStore.getState().toggleMaximized("codeEditor");
    expect(useLayoutStore.getState().maximized).toBe("codeEditor");
    useLayoutStore.getState().toggleMaximized("codeEditor");
    expect(useLayoutStore.getState().maximized).toBeNull();
  });

  it("switches the maximized panel when called with a different id", () => {
    useLayoutStore.getState().toggleMaximized("nodeEditor");
    useLayoutStore.getState().toggleMaximized("sidePanel");
    expect(useLayoutStore.getState().maximized).toBe("sidePanel");
  });

  it("forces the newly-maximized panel's collapsed flag to false", () => {
    useLayoutStore.getState().toggleCollapsed("viewport");
    expect(useLayoutStore.getState().collapsed.viewport).toBe(true);
    useLayoutStore.getState().toggleMaximized("viewport");
    expect(useLayoutStore.getState().collapsed.viewport).toBe(false);
    expect(useLayoutStore.getState().maximized).toBe("viewport");
  });
});

import { describe, expect, it } from "vitest";
import type { GraphNodeKind } from "../../core/graph/types";
import { minimapColorFor, NODE_TYPES, NODE_UI } from "./nodeUiRegistry";

const ALL_KINDS: GraphNodeKind[] = [
  "mesh",
  "image",
  "webcam",
  "video",
  "shader",
  "compute",
  "output",
  "param",
  "math",
  "swizzle",
  "combine",
];

describe("NODE_UI registry", () => {
  it("exposes an entry for every GraphNodeKind", () => {
    expect(Object.keys(NODE_UI).sort()).toEqual([...ALL_KINDS].sort());
    expect(Object.keys(NODE_TYPES).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("pairs each kind with a component and a hex color", () => {
    for (const kind of ALL_KINDS) {
      const spec = NODE_UI[kind];
      expect(typeof spec.view).toBe("function");
      expect(spec.minimapColor).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });

  it("NODE_TYPES is derived from NODE_UI (same component references)", () => {
    for (const kind of ALL_KINDS) {
      expect(NODE_TYPES[kind]).toBe(NODE_UI[kind].view);
    }
  });
});

describe("minimapColorFor", () => {
  it("returns the registered color for known kinds", () => {
    expect(minimapColorFor("shader")).toBe(NODE_UI.shader.minimapColor);
    expect(minimapColorFor("mesh")).toBe(NODE_UI.mesh.minimapColor);
  });

  it("falls back for unknown / undefined kinds", () => {
    expect(minimapColorFor(undefined)).toBe("#888888");
    expect(minimapColorFor("not-a-real-kind")).toBe("#888888");
    expect(minimapColorFor("")).toBe("#888888");
  });
});

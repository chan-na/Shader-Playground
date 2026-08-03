import { describe, expect, it } from "vitest";
import { withExplicitDefaults } from "./uniformDefaults";

describe("withExplicitDefaults (T3/C-2)", () => {
  it("seeds only explicit @default uniforms when nothing is stored", () => {
    const source = `
      uniform float u_x; // @default 3
      uniform float u_y;
      uniform vec3 u_tint; // @default 0.5,0.7,1.0
    `;
    const out = withExplicitDefaults(source, {});
    expect(out).toEqual({ u_x: 3, u_tint: [0.5, 0.7, 1.0] });
    // u_y has no @default hint at all — not seeded, not even with a
    // heuristic value. Absence, not a fabricated 0.
    expect(out.u_y).toBeUndefined();
  });

  it("does not seed a color-named uniform whose default is only the name-based heuristic", () => {
    // u_baseColor's [1,1,1] heuristic default has no @default hint behind
    // it — must stay unseeded (C-2's explicit-only decision).
    const source = `uniform vec3 u_baseColor;`;
    expect(withExplicitDefaults(source, {})).toEqual({});
  });

  it("a stored value always wins over @default (the core C-2 invariant)", () => {
    const source = `uniform vec3 u_baseColor; // @default 0.5,0.7,1.0`;
    const out = withExplicitDefaults(source, { u_baseColor: [0.2, 0.6, 1.0] });
    expect(out).toEqual({ u_baseColor: [0.2, 0.6, 1.0] });
  });

  it("stored keys not mentioned in the source pass through untouched", () => {
    const source = `uniform float u_x; // @default 3`;
    const out = withExplicitDefaults(source, { u_stale: 9 });
    expect(out).toEqual({ u_x: 3, u_stale: 9 });
  });

  it("excludes system, sampler, and matrix uniforms even with @default", () => {
    const source = `
      uniform float u_time; // @default 5
      uniform sampler2D u_tex; // @default 1
      uniform mat4 u_model; // @default 1
    `;
    expect(withExplicitDefaults(source, {})).toEqual({});
  });

  it("does not mutate the stored input object", () => {
    const source = `uniform float u_x; // @default 3`;
    const stored = { u_y: 1 };
    const out = withExplicitDefaults(source, stored);
    expect(stored).toEqual({ u_y: 1 });
    expect(out).not.toBe(stored);
  });

  it("returns a fresh array for a seeded vector default (no shared reference to the parsed spec)", () => {
    const source = `uniform vec3 u_tint; // @default 0.5,0.7,1.0`;
    const out1 = withExplicitDefaults(source, {});
    const out2 = withExplicitDefaults(source, {});
    expect(out1.u_tint).toEqual(out2.u_tint);
    expect(out1.u_tint).not.toBe(out2.u_tint);
  });
});

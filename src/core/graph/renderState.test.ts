import { describe, expect, it, vi } from "vitest";
import { createFakeGl } from "../gl/fakeGl";
import { applyRenderState, renderStateFor } from "./renderState";

describe("renderStateFor", () => {
  it("fullscreen pass: depth off, blend/cull off", () => {
    expect(renderStateFor(true)).toEqual({
      blend: false,
      cull: false,
      depthTest: false,
    });
  });

  it("mesh pass: depth on, blend/cull still off (L4 — not exposed as nodes/ports yet)", () => {
    expect(renderStateFor(false)).toEqual({
      blend: false,
      cull: false,
      depthTest: true,
    });
  });
});

describe("applyRenderState", () => {
  it("enables DEPTH_TEST and disables CULL_FACE/BLEND for a mesh pass", () => {
    const gl = createFakeGl();
    const enable = vi.spyOn(gl, "enable");
    const disable = vi.spyOn(gl, "disable");

    applyRenderState(gl, renderStateFor(false));

    expect(enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(disable).toHaveBeenCalledWith(gl.CULL_FACE);
    expect(disable).toHaveBeenCalledWith(gl.BLEND);
    expect(enable.mock.calls.some((c) => c[0] === gl.CULL_FACE)).toBe(false);
    expect(enable.mock.calls.some((c) => c[0] === gl.BLEND)).toBe(false);
  });

  it("disables DEPTH_TEST/CULL_FACE/BLEND for a fullscreen pass", () => {
    const gl = createFakeGl();
    const enable = vi.spyOn(gl, "enable");
    const disable = vi.spyOn(gl, "disable");

    applyRenderState(gl, renderStateFor(true));

    expect(disable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(disable).toHaveBeenCalledWith(gl.CULL_FACE);
    expect(disable).toHaveBeenCalledWith(gl.BLEND);
    expect(enable).not.toHaveBeenCalled();
  });
});

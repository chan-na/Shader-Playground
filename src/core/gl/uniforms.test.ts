import { describe, expect, it, vi } from "vitest";
import { createFakeGl } from "./fakeGl";
import { setUniform } from "./uniforms";

describe("setUniform", () => {
  it("returns immediately when location is null (no gl call)", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniform1f");
    setUniform(gl, null, 1.0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("dispatches number → uniform1f", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniform1f");
    const loc = {} as WebGLUniformLocation;
    setUniform(gl, loc, 0.5);
    expect(spy).toHaveBeenCalledWith(loc, 0.5);
  });

  it("dispatches Float32Array length 16 → uniformMatrix4fv", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniformMatrix4fv");
    setUniform(gl, {} as WebGLUniformLocation, new Float32Array(16));
    expect(spy).toHaveBeenCalled();
  });

  it("dispatches Float32Array length 9 → uniformMatrix3fv", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniformMatrix3fv");
    setUniform(gl, {} as WebGLUniformLocation, new Float32Array(9));
    expect(spy).toHaveBeenCalled();
  });

  it("dispatches Float32Array length 4/3/2/1 → uniform4fv/3fv/2fv/1fv", () => {
    const gl = createFakeGl();
    for (const len of [1, 2, 3, 4] as const) {
      const fnName = `uniform${len}fv` as const;
      const spy = vi.spyOn(gl, fnName);
      setUniform(gl, {} as WebGLUniformLocation, new Float32Array(len));
      expect(spy).toHaveBeenCalled();
    }
  });

  it("dispatches array [a, b] → uniform2f", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniform2f");
    setUniform(gl, {} as WebGLUniformLocation, [1, 2]);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 1, 2);
  });

  it("dispatches array [a, b, c] → uniform3f", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniform3f");
    setUniform(gl, {} as WebGLUniformLocation, [1, 2, 3]);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 1, 2, 3);
  });

  it("dispatches array [a, b, c, d] → uniform4f", () => {
    const gl = createFakeGl();
    const spy = vi.spyOn(gl, "uniform4f");
    setUniform(gl, {} as WebGLUniformLocation, [1, 2, 3, 4]);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 1, 2, 3, 4);
  });

  it("dispatches sampler2D → activeTexture + bindTexture + uniform1i", () => {
    const gl = createFakeGl();
    const active = vi.spyOn(gl, "activeTexture");
    const bind = vi.spyOn(gl, "bindTexture");
    const uniform1i = vi.spyOn(gl, "uniform1i");
    const tex = {} as WebGLTexture;
    setUniform(gl, {} as WebGLUniformLocation, {
      kind: "sampler2D",
      texture: tex,
      unit: 2,
    });
    expect(active).toHaveBeenCalledWith(gl.TEXTURE0 + 2);
    expect(bind).toHaveBeenCalledWith(gl.TEXTURE_2D, tex);
    expect(uniform1i).toHaveBeenCalledWith(expect.anything(), 2);
  });
});

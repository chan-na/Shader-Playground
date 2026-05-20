import { describe, expect, it } from "vitest";
import { clearLogBuffer, getLogBuffer } from "../../utils/log";
import { createFakeGl } from "./fakeGl";
import {
  createProgram,
  createTransformFeedbackProgram,
  disposeProgram,
} from "./program";

const VS = "void main(){}";
const FS = "void main(){}";

describe("createProgram", () => {
  it("returns a CompiledProgram with parsed attributes + uniforms on success", () => {
    const gl = createFakeGl({
      attributes: ["a_position", "a_uv"],
      uniforms: ["u_time", "u_tint"],
    });
    const r = createProgram(gl, VS, FS);
    expect(r.errors).toEqual([]);
    expect(r.program).not.toBeNull();
    expect(Object.keys(r.program!.attributes).sort()).toEqual([
      "a_position",
      "a_uv",
    ]);
    expect(Object.keys(r.program!.uniforms).sort()).toEqual([
      "u_time",
      "u_tint",
    ]);
  });

  it("strips trailing array subscripts from uniform names", () => {
    const gl = createFakeGl({ uniforms: ["u_arr[0]"] });
    const r = createProgram(gl, VS, FS);
    expect(r.program?.uniforms).toHaveProperty("u_arr");
  });

  it("reports vertex compile failure and returns no program", () => {
    const gl = createFakeGl({ compileFailure: true });
    const r = createProgram(gl, VS, FS);
    expect(r.program).toBeNull();
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors[0]?.stage).toBe("vertex");
  });

  it("reports link failure with a 'link' stage error", () => {
    const gl = createFakeGl({ linkFailure: true });
    const r = createProgram(gl, VS, FS);
    expect(r.program).toBeNull();
    expect(r.errors.some((e) => e.stage === "link")).toBe(true);
  });

  it("returns a 'link' error when createShader returns null", () => {
    const gl = createFakeGl({ resourceFailure: true });
    const r = createProgram(gl, VS, FS);
    expect(r.program).toBeNull();
    expect(r.errors.some((e) => e.stage === "link")).toBe(true);
  });

  it("disposeProgram does not throw", () => {
    const gl = createFakeGl();
    const r = createProgram(gl, VS, FS);
    expect(() => disposeProgram(gl, r.program!)).not.toThrow();
  });

  it("surfaces a post-link GL error via the logger (still returns the program)", () => {
    clearLogBuffer();
    const gl = createFakeGl({ glError: 0x0502 });
    const r = createProgram(gl, VS, FS);
    expect(r.program).not.toBeNull();
    const buf = getLogBuffer();
    const entry = buf[buf.length - 1];
    expect(entry?.category).toBe("gl");
    expect(entry?.message).toContain("createProgram");
  });
});

describe("createTransformFeedbackProgram", () => {
  it("declares varyings and returns a compiled program on success", () => {
    const gl = createFakeGl({
      attributes: ["a_in"],
      uniforms: ["u_dt"],
    });
    const r = createTransformFeedbackProgram(gl, VS, FS, ["v_out"]);
    expect(r.program).not.toBeNull();
    expect(r.errors).toEqual([]);
  });

  it("skips transformFeedbackVaryings when the list is empty (still succeeds)", () => {
    const gl = createFakeGl();
    const r = createTransformFeedbackProgram(gl, VS, FS, []);
    expect(r.program).not.toBeNull();
  });

  it("reports link failure for TF program too", () => {
    const gl = createFakeGl({ linkFailure: true });
    const r = createTransformFeedbackProgram(gl, VS, FS, ["v_out"]);
    expect(r.program).toBeNull();
    expect(r.errors.some((e) => e.stage === "link")).toBe(true);
  });

  it("reports compile failure for TF program too", () => {
    const gl = createFakeGl({ compileFailure: true });
    const r = createTransformFeedbackProgram(gl, VS, FS, ["v_out"]);
    expect(r.program).toBeNull();
    expect(r.errors.some((e) => e.stage === "vertex")).toBe(true);
  });

  it("returns a link error when createProgram resource allocation fails", () => {
    const gl = createFakeGl({ resourceFailure: true });
    const r = createTransformFeedbackProgram(gl, VS, FS, ["v_out"]);
    expect(r.program).toBeNull();
    expect(r.errors.some((e) => e.stage === "link")).toBe(true);
  });
});

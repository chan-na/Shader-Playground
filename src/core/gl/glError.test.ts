import { beforeEach, describe, expect, it } from "vitest";
import { clearLogBuffer, getLogBuffer } from "../../utils/log";
import { createFakeGl } from "./fakeGl";
import { checkGlError, glErrorName } from "./glError";

describe("glErrorName", () => {
  it("maps known WebGL error codes to their names", () => {
    expect(glErrorName(0x0502)).toBe("INVALID_OPERATION");
    expect(glErrorName(0x0505)).toBe("OUT_OF_MEMORY");
    expect(glErrorName(0x9242)).toBe("CONTEXT_LOST_WEBGL");
  });

  it("falls back to a hex string for unknown codes", () => {
    expect(glErrorName(0x1234)).toBe("0x1234");
  });
});

describe("checkGlError", () => {
  beforeEach(() => {
    clearLogBuffer();
  });

  it("returns 0 and logs nothing when the context is clean", () => {
    const gl = createFakeGl();
    expect(checkGlError(gl, "ctx")).toBe(0);
    expect(getLogBuffer().length).toBe(0);
  });

  it("logs a gl error entry naming the code and context when set", () => {
    const gl = createFakeGl({ glError: 0x0502 });
    expect(checkGlError(gl, "createProgram")).toBe(0x0502);
    const buf = getLogBuffer();
    const entry = buf[buf.length - 1];
    expect(entry?.level).toBe("error");
    expect(entry?.category).toBe("gl");
    expect(entry?.message).toBe("createProgram: INVALID_OPERATION");
    expect(entry?.detail).toEqual({ code: 0x0502 });
  });

  it("drains the queue so a one-shot error doesn't re-log on the next probe", () => {
    const gl = createFakeGl({ glError: 0x0501 });
    checkGlError(gl, "first");
    checkGlError(gl, "second");
    const buf = getLogBuffer();
    expect(buf.length).toBe(1);
    expect(buf[0]?.message).toContain("INVALID_VALUE");
  });
});

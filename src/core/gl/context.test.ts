import { describe, expect, it, vi } from "vitest";
import { createGLContext } from "./context";
import { createFakeGl } from "./fakeGl";

describe("createGLContext", () => {
  it("returns the WebGL2 context when canvas.getContext succeeds", () => {
    const canvas = document.createElement("canvas");
    const fakeGl = createFakeGl();
    vi.spyOn(canvas, "getContext").mockReturnValue(
      fakeGl as unknown as RenderingContext,
    );
    expect(createGLContext(canvas)).toBe(fakeGl);
  });

  it("throws when WebGL2 is not available (getContext returns null)", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(() => createGLContext(canvas)).toThrow(/WebGL2 is not supported/);
  });
});

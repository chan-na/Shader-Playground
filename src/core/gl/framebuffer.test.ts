import { describe, expect, it } from "vitest";
import { createFakeGl } from "./fakeGl";
import {
  bindFramebuffer,
  createFramebuffer,
  disposeFramebuffer,
} from "./framebuffer";

describe("createFramebuffer", () => {
  it("allocates color texture + depth renderbuffer by default", () => {
    const gl = createFakeGl();
    const fb = createFramebuffer(gl, 256, 128);
    expect(fb.width).toBe(256);
    expect(fb.height).toBe(128);
    expect(fb.color).toBeDefined();
    expect(fb.depth).not.toBeNull();
  });

  it("skips depth allocation when withDepth is false", () => {
    const gl = createFakeGl();
    const fb = createFramebuffer(gl, 64, 64, false);
    expect(fb.depth).toBeNull();
  });

  it("throws when createFramebuffer returns null", () => {
    const gl = createFakeGl({ resourceFailure: true });
    expect(() => createFramebuffer(gl, 32, 32)).toThrow();
  });

  it("throws when the framebuffer is incomplete", () => {
    const gl = createFakeGl({ framebufferStatus: 0xdead });
    expect(() => createFramebuffer(gl, 32, 32)).toThrow(
      /Framebuffer incomplete/,
    );
  });
});

describe("bindFramebuffer / disposeFramebuffer", () => {
  it("bindFramebuffer(null) does not touch viewport", () => {
    const gl = createFakeGl();
    expect(() => bindFramebuffer(gl, null)).not.toThrow();
  });

  it("bindFramebuffer(fb) sets viewport to the fb dimensions", () => {
    const gl = createFakeGl();
    const fb = createFramebuffer(gl, 100, 50);
    expect(() => bindFramebuffer(gl, fb)).not.toThrow();
  });

  it("disposeFramebuffer cleans up color + depth without throwing", () => {
    const gl = createFakeGl();
    const fb = createFramebuffer(gl, 32, 32);
    expect(() => disposeFramebuffer(gl, fb)).not.toThrow();
  });

  it("disposeFramebuffer also handles depth-less FBOs", () => {
    const gl = createFakeGl();
    const fb = createFramebuffer(gl, 32, 32, false);
    expect(() => disposeFramebuffer(gl, fb)).not.toThrow();
  });
});

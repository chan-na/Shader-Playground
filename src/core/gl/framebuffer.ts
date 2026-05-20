import { log } from "../../utils/log";
import { createColorTexture, disposeTexture, type GLTexture } from "./texture";

export interface Framebuffer {
  fbo: WebGLFramebuffer;
  color: GLTexture;
  depth: WebGLRenderbuffer | null;
  width: number;
  height: number;
}

export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  withDepth = true,
): Framebuffer {
  const color = createColorTexture(gl, width, height);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("createFramebuffer returned null");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    color.texture,
    0,
  );

  let depth: WebGLRenderbuffer | null = null;
  if (withDepth) {
    depth = gl.createRenderbuffer();
    if (!depth) throw new Error("createRenderbuffer returned null");
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT24,
      width,
      height,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    const hex = `0x${status.toString(16)}`;
    log.warn("gl", `Framebuffer incomplete: ${hex}`, { status, width, height });
    throw new Error(`Framebuffer incomplete: ${hex}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, color, depth, width, height };
}

export function disposeFramebuffer(
  gl: WebGL2RenderingContext,
  fb: Framebuffer,
) {
  gl.deleteFramebuffer(fb.fbo);
  disposeTexture(gl, fb.color);
  if (fb.depth) gl.deleteRenderbuffer(fb.depth);
}

export function bindFramebuffer(
  gl: WebGL2RenderingContext,
  fb: Framebuffer | null,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb ? fb.fbo : null);
  if (fb) gl.viewport(0, 0, fb.width, fb.height);
}

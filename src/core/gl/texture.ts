export interface GLTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
  internalFormat: number;
  type: number;
}

/**
 * [E-3] The wrap/filter/mipmap/flip parameters a texture is created with —
 * promoted from GL-call literals to a named constant so the Inspector can
 * display exactly what `createColorTexture`/`createImageTexture` apply,
 * instead of a hand-copied string that can drift from the real GL calls.
 */
export interface TextureParamInfo {
  wrapS: "CLAMP_TO_EDGE" | "REPEAT";
  wrapT: "CLAMP_TO_EDGE" | "REPEAT";
  minFilter: "LINEAR" | "LINEAR_MIPMAP_LINEAR";
  magFilter: "LINEAR";
  mipmaps: boolean;
  flipY: boolean;
}

/** Applied by `createColorTexture` — the FBO texture every shader pass
 *  renders into and every downstream sampler reads. */
export const FBO_TEXTURE_PARAMS: TextureParamInfo = {
  wrapS: "CLAMP_TO_EDGE",
  wrapT: "CLAMP_TO_EDGE",
  minFilter: "LINEAR",
  magFilter: "LINEAR",
  mipmaps: false,
  flipY: false,
};

/** Applied by `createImageTexture` — user-uploaded Image node textures.
 *  Deliberately different from `FBO_TEXTURE_PARAMS` (L2): the same GLSL
 *  sampling the same UV can produce a different result depending on which
 *  of the two a sampler is actually bound to. */
export const IMAGE_TEXTURE_PARAMS: TextureParamInfo = {
  wrapS: "REPEAT",
  wrapT: "REPEAT",
  minFilter: "LINEAR_MIPMAP_LINEAR",
  magFilter: "LINEAR",
  mipmaps: true,
  flipY: true,
};

export function createColorTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): GLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("createTexture returned null");
  const p = FBO_TEXTURE_PARAMS;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[p.minFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[p.magFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[p.wrapS]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[p.wrapT]);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    texture,
    width,
    height,
    format: gl.RGBA,
    internalFormat: gl.RGBA8,
    type: gl.UNSIGNED_BYTE,
  };
}

export function createImageTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
): GLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("createTexture returned null");
  const p = IMAGE_TEXTURE_PARAMS;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Flip Y so v_uv.y=0 maps to the bottom row, matching OpenGL convention
  // and the fullscreen-quad UV produced by fullscreen.vert.
  if (p.flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (p.flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (p.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[p.minFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[p.magFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[p.wrapS]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[p.wrapT]);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const width = (source as ImageBitmap).width ?? 1;
  const height = (source as ImageBitmap).height ?? 1;
  return {
    texture,
    width,
    height,
    format: gl.RGBA,
    internalFormat: gl.RGBA8,
    type: gl.UNSIGNED_BYTE,
  };
}

export function disposeTexture(gl: WebGL2RenderingContext, t: GLTexture) {
  gl.deleteTexture(t.texture);
}

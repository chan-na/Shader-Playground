export interface GLTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
  internalFormat: number;
  type: number;
}

export function createColorTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): GLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture returned null');
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

export function disposeTexture(gl: WebGL2RenderingContext, t: GLTexture) {
  gl.deleteTexture(t.texture);
}

export function createGLContext(
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 is not supported");
  return gl;
}

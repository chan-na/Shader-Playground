import vertSrc from './shaders/fullscreen.vert?raw';
import fragSrc from './shaders/color.frag?raw';

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new Error(`Failed to compile ${kind} shader:\n${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram returned null');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Failed to link program:\n${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#gl');
  if (!canvas) throw new Error('Canvas #gl not found');

  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 is not supported in this browser');

  const program = createProgram(gl, vertSrc, fragSrc);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const timeLoc = gl.getUniformLocation(program, 'u_time');
  const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');

  const quad = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas!.clientWidth * dpr);
    const h = Math.floor(canvas!.clientHeight * dpr);
    if (canvas!.width !== w || canvas!.height !== h) {
      canvas!.width = w;
      canvas!.height = h;
    }
    gl!.viewport(0, 0, canvas!.width, canvas!.height);
  }

  const start = performance.now();

  function frame() {
    resize();
    const t = (performance.now() - start) / 1000;

    gl!.useProgram(program);
    gl!.bindVertexArray(vao);
    gl!.uniform1f(timeLoc, t);
    gl!.uniform2f(resolutionLoc, canvas!.width, canvas!.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();

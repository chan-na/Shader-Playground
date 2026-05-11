export interface MeshAttribute {
  name: string;
  data: Float32Array;
  size: number;
}

export interface MeshData {
  attributes: MeshAttribute[];
  indices?: Uint16Array | Uint32Array;
  vertexCount: number;
  primitive?: number;
}

export interface GLMesh {
  vao: WebGLVertexArrayObject;
  vbos: WebGLBuffer[];
  ibo: WebGLBuffer | null;
  indexType: number;
  indexCount: number;
  vertexCount: number;
  primitive: number;
}

export function uploadMesh(
  gl: WebGL2RenderingContext,
  data: MeshData,
  attribLocations: Record<string, number>,
): GLMesh {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("createVertexArray returned null");
  gl.bindVertexArray(vao);

  const vbos: WebGLBuffer[] = [];
  for (const attr of data.attributes) {
    const loc = attribLocations[attr.name];
    if (loc === undefined || loc < 0) continue;
    const vbo = gl.createBuffer();
    if (!vbo) throw new Error("createBuffer returned null");
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, attr.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, 0, 0);
    vbos.push(vbo);
  }

  let ibo: WebGLBuffer | null = null;
  let indexType: number = gl.UNSIGNED_SHORT;
  let indexCount = 0;
  if (data.indices) {
    ibo = gl.createBuffer();
    if (!ibo) throw new Error("createBuffer (IBO) returned null");
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    indexType =
      data.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    indexCount = data.indices.length;
  }

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return {
    vao,
    vbos,
    ibo,
    indexType,
    indexCount,
    vertexCount: data.vertexCount,
    primitive: data.primitive ?? gl.TRIANGLES,
  };
}

export function drawMesh(gl: WebGL2RenderingContext, mesh: GLMesh) {
  gl.bindVertexArray(mesh.vao);
  if (mesh.ibo) {
    gl.drawElements(mesh.primitive, mesh.indexCount, mesh.indexType, 0);
  } else {
    gl.drawArrays(mesh.primitive, 0, mesh.vertexCount);
  }
}

export function disposeMesh(gl: WebGL2RenderingContext, mesh: GLMesh) {
  gl.deleteVertexArray(mesh.vao);
  for (const b of mesh.vbos) gl.deleteBuffer(b);
  if (mesh.ibo) gl.deleteBuffer(mesh.ibo);
}

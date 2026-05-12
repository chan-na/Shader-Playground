import fullscreenVert from "../../shaders/fullscreen.vert?raw";
import tfNoopFrag from "../../shaders/tfNoop.frag?raw";
import { makePrimitive } from "../assets/primitives";
import type { GeometryHandle, ImageHandle } from "../assets/types";
import {
  createFramebuffer,
  disposeFramebuffer,
  type Framebuffer,
} from "../gl/framebuffer";
import {
  disposeMesh,
  type GLMesh,
  type MeshData,
  uploadMesh,
} from "../gl/mesh";
import {
  type CompiledProgram,
  createProgram,
  createTransformFeedbackProgram,
  disposeProgram,
  type ShaderError,
} from "../gl/program";
import {
  createImageTexture,
  disposeTexture,
  type GLTexture,
} from "../gl/texture";
import { generateSeed } from "./computeSeed";
import type {
  ComputeGraphNode,
  Graph,
  GraphNode,
  ImageGraphNode,
  MeshGraphNode,
  ShaderGraphNode,
} from "./types";
import {
  topologicalOrder,
  type ValidationError,
  validateGraph,
} from "./validate";

interface AssetCatalog {
  meshes: Record<string, GeometryHandle>;
  images: Record<string, ImageHandle>;
}

const EMPTY_ASSETS: AssetCatalog = { meshes: {}, images: {} };

interface SamplerBinding {
  uniformName: string;
  sourceNodeId: string;
  unit: number;
}

interface ParamBinding {
  uniformName: string;
  sourceNodeId: string;
}

export interface ShaderPass {
  kind: "shader";
  nodeId: string;
  program: CompiledProgram;
  fbo: Framebuffer;
  mesh: GLMesh;
  meshIsFullscreen: boolean;
  /**
   * When non-null, this pass's mesh attributes come from a ComputeNode's
   * ping-pong vbo set. The two VAOs were created against the compute pass's
   * vboA and vboB respectively; the executor switches between them each frame
   * based on the compute pass's current `read` side.
   */
  meshComputeNodeId: string | null;
  meshComputeVaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] | null;
  samplers: SamplerBinding[];
  /** Edges that override a uniform's value with a parameter node. */
  paramBindings: ParamBinding[];
  uniformValues: Record<string, number | number[]>;
}

interface ComputeAttributeSlot {
  inName: string;
  outName: string;
  size: number;
  /** Two ping-pong VBOs; one is the input source, the other captures TF output. */
  vboA: WebGLBuffer;
  vboB: WebGLBuffer;
}

export interface ComputePass {
  kind: "compute";
  nodeId: string;
  program: CompiledProgram;
  attributes: ComputeAttributeSlot[];
  /** VAO that reads attribute slot N from each slot's vboA. */
  vaoA: WebGLVertexArrayObject;
  /** VAO that reads attribute slot N from each slot's vboB. */
  vaoB: WebGLVertexArrayObject;
  /** TF object that captures into vboA across all attribute slots. */
  tfA: WebGLTransformFeedback;
  /** TF object that captures into vboB across all attribute slots. */
  tfB: WebGLTransformFeedback;
  count: number;
  /** WebGL constant (gl.POINTS / LINES / TRIANGLES). */
  primitive: number;
  paramBindings: ParamBinding[];
  uniformValues: Record<string, number | number[]>;
  /** Which side currently holds the freshest captured data (= next input). */
  read: "A" | "B";
}

export type Pass = ShaderPass | ComputePass;

interface OutputBinding {
  outputNodeId: string;
  sourceNodeId: string | null;
}

export interface ExecutionPlan {
  passes: Pass[];
  imageTextures: Record<string, GLTexture>;
  /** One entry per Output node in document order. */
  outputs: OutputBinding[];
  /** @deprecated kept for backward compat; mirrors outputs[0]. */
  outputNodeId: string | null;
  outputSourceNodeId: string | null;
  errors: ValidationError[];
  shaderErrors: Record<string, ShaderError[]>;
  width: number;
  height: number;
  /** True when at least one ComputePass exists — RAF idle gate checks this. */
  hasCompute: boolean;
  dispose: () => void;
}

export interface CompileOptions {
  width: number;
  height: number;
  assets?: AssetCatalog;
}

export function emptyPlan(width: number, height: number): ExecutionPlan {
  return {
    passes: [],
    imageTextures: {},
    outputs: [],
    outputNodeId: null,
    outputSourceNodeId: null,
    errors: [],
    shaderErrors: {},
    width,
    height,
    hasCompute: false,
    dispose: () => {},
  };
}

function findEdgeTo(graph: Graph, target: string, handle: string) {
  return graph.edges.find(
    (e) => e.target === target && e.targetHandle === handle,
  );
}

function findEdgesToTarget(graph: Graph, target: string) {
  return graph.edges.filter((e) => e.target === target);
}

function meshDataFor(node: GraphNode, assets: AssetCatalog): MeshData | null {
  if (node.kind !== "mesh") return null;
  const mn = node as MeshGraphNode;
  if (mn.assetId) {
    const handle = assets.meshes[mn.assetId];
    if (handle) return handle.data;
    // Asset not yet loaded — fall through to primitive fallback.
  }
  return makePrimitive(mn.primitive);
}

function glPrimitiveOf(
  gl: WebGL2RenderingContext,
  prim: ComputeGraphNode["primitive"],
): number {
  if (prim === "POINTS") return gl.POINTS;
  if (prim === "LINES") return gl.LINES;
  return gl.TRIANGLES;
}

function buildComputePass(
  gl: WebGL2RenderingContext,
  node: ComputeGraphNode,
  graph: Graph,
  shaderErrors: Record<string, ShaderError[]>,
  disposers: Array<() => void>,
): ComputePass | null {
  const built = createTransformFeedbackProgram(
    gl,
    node.vertexSource,
    tfNoopFrag,
    node.attributes.map((a) => a.outName),
  );
  if (built.errors.length) shaderErrors[node.id] = built.errors;
  if (!built.program) return null;

  // Allocate two vbos per attribute slot and seed both sides with the same data
  // so the first dispatch reads a meaningful initial state regardless of which
  // side is `read`.
  const slots: ComputeAttributeSlot[] = [];
  for (const attr of node.attributes) {
    const data = generateSeed(attr.seed, node.count, attr.size);
    const vboA = gl.createBuffer();
    const vboB = gl.createBuffer();
    if (!vboA || !vboB) {
      if (vboA) gl.deleteBuffer(vboA);
      if (vboB) gl.deleteBuffer(vboB);
      shaderErrors[node.id] = [
        ...(shaderErrors[node.id] ?? []),
        { stage: "link", message: "Failed to allocate compute vbo", raw: "" },
      ];
      disposeProgram(gl, built.program);
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vboA);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboB);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
    slots.push({
      inName: attr.inName,
      outName: attr.outName,
      size: attr.size,
      vboA,
      vboB,
    });
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Capture `built.program` in a non-nullable local — closures lose the
  // null narrowing from the early-return guard above.
  const program = built.program;
  const buildVao = (side: "A" | "B"): WebGLVertexArrayObject | null => {
    const vao = gl.createVertexArray();
    if (!vao) return null;
    gl.bindVertexArray(vao);
    for (const slot of slots) {
      const loc = program.attributes[slot.inName];
      if (loc === undefined || loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, side === "A" ? slot.vboA : slot.vboB);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, slot.size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  };
  const vaoA = buildVao("A");
  const vaoB = buildVao("B");
  if (!vaoA || !vaoB) {
    for (const slot of slots) {
      gl.deleteBuffer(slot.vboA);
      gl.deleteBuffer(slot.vboB);
    }
    if (vaoA) gl.deleteVertexArray(vaoA);
    if (vaoB) gl.deleteVertexArray(vaoB);
    disposeProgram(gl, built.program);
    shaderErrors[node.id] = [
      ...(shaderErrors[node.id] ?? []),
      { stage: "link", message: "Failed to allocate compute VAO", raw: "" },
    ];
    return null;
  }

  const buildTf = (side: "A" | "B"): WebGLTransformFeedback | null => {
    const tf = gl.createTransformFeedback();
    if (!tf) return null;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    for (const [i, slot] of slots.entries()) {
      gl.bindBufferBase(
        gl.TRANSFORM_FEEDBACK_BUFFER,
        i,
        side === "A" ? slot.vboA : slot.vboB,
      );
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    return tf;
  };
  const tfA = buildTf("A");
  const tfB = buildTf("B");
  if (!tfA || !tfB) {
    for (const slot of slots) {
      gl.deleteBuffer(slot.vboA);
      gl.deleteBuffer(slot.vboB);
    }
    gl.deleteVertexArray(vaoA);
    gl.deleteVertexArray(vaoB);
    if (tfA) gl.deleteTransformFeedback(tfA);
    if (tfB) gl.deleteTransformFeedback(tfB);
    disposeProgram(gl, built.program);
    shaderErrors[node.id] = [
      ...(shaderErrors[node.id] ?? []),
      {
        stage: "link",
        message: "Failed to allocate transform feedback object",
        raw: "",
      },
    ];
    return null;
  }

  // Classify incoming edges as param bindings. Texture/mesh inputs are
  // forbidden on ComputeNode by the registry (no such ports), so any stray
  // edges are silently ignored here.
  const paramBindings: ParamBinding[] = [];
  for (const e of findEdgesToTarget(graph, node.id)) {
    const src = graph.nodes.find((n) => n.id === e.source);
    if (!src) continue;
    if (
      src.kind === "param" ||
      src.kind === "math" ||
      src.kind === "swizzle" ||
      src.kind === "combine"
    ) {
      paramBindings.push({
        uniformName: e.targetHandle,
        sourceNodeId: e.source,
      });
    }
  }

  const pass: ComputePass = {
    kind: "compute",
    nodeId: node.id,
    program: built.program,
    attributes: slots,
    vaoA,
    vaoB,
    tfA,
    tfB,
    count: Math.max(1, node.count | 0),
    primitive: glPrimitiveOf(gl, node.primitive),
    paramBindings,
    uniformValues: { ...node.uniformValues },
    read: "A",
  };
  disposers.push(() => {
    for (const slot of pass.attributes) {
      gl.deleteBuffer(slot.vboA);
      gl.deleteBuffer(slot.vboB);
    }
    gl.deleteVertexArray(pass.vaoA);
    gl.deleteVertexArray(pass.vaoB);
    gl.deleteTransformFeedback(pass.tfA);
    gl.deleteTransformFeedback(pass.tfB);
    disposeProgram(gl, pass.program);
  });
  return pass;
}

function buildShaderComputeVaos(
  gl: WebGL2RenderingContext,
  program: CompiledProgram,
  computePass: ComputePass,
): [WebGLVertexArrayObject, WebGLVertexArrayObject] | null {
  const makeVao = (side: "A" | "B"): WebGLVertexArrayObject | null => {
    const vao = gl.createVertexArray();
    if (!vao) return null;
    gl.bindVertexArray(vao);
    for (const slot of computePass.attributes) {
      const loc = program.attributes[slot.inName];
      if (loc === undefined || loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, side === "A" ? slot.vboA : slot.vboB);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, slot.size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  };
  const a = makeVao("A");
  const b = makeVao("B");
  if (!a || !b) {
    if (a) gl.deleteVertexArray(a);
    if (b) gl.deleteVertexArray(b);
    return null;
  }
  return [a, b];
}

export function compileGraph(
  gl: WebGL2RenderingContext,
  graph: Graph,
  opts: CompileOptions,
): ExecutionPlan {
  const assets = opts.assets ?? EMPTY_ASSETS;
  const errors = validateGraph(graph);
  const shaderErrors: Record<string, ShaderError[]> = {};
  const fatal = errors.some(
    (e) =>
      e.code === "cycle" ||
      e.code === "multi_input" ||
      e.code === "multiple_outputs",
  );
  if (fatal) {
    return { ...emptyPlan(opts.width, opts.height), errors };
  }

  const ordered = topologicalOrder(graph);

  const passes: Pass[] = [];
  const passByNode = new Map<string, Pass>();
  const disposers: Array<() => void> = [];

  // Upload any image textures referenced by ImageNodes so ShaderNodes can
  // sample them through the existing sampler-routing path.
  const imageTextures: Record<string, GLTexture> = {};
  for (const node of graph.nodes) {
    if (node.kind !== "image") continue;
    const inode = node as ImageGraphNode;
    if (!inode.assetId) continue;
    const handle = assets.images[inode.assetId];
    if (!handle?.bitmap) continue;
    try {
      const tex = createImageTexture(gl, handle.bitmap);
      imageTextures[node.id] = tex;
      disposers.push(() => disposeTexture(gl, tex));
    } catch {
      // Skip silently — the ShaderNode will see no source and stay blank.
    }
  }

  // Build passes in topological order so a ShaderNode that consumes a
  // ComputeNode's mesh output can already see the ComputePass in passByNode.
  for (const node of ordered) {
    if (node.kind === "compute") {
      const cp = buildComputePass(
        gl,
        node as ComputeGraphNode,
        graph,
        shaderErrors,
        disposers,
      );
      if (cp) {
        passes.push(cp);
        passByNode.set(node.id, cp);
      }
      continue;
    }
    if (node.kind !== "shader") continue;
    const sn = node as ShaderGraphNode;

    // Determine mesh input
    const meshEdge = findEdgeTo(graph, sn.id, "mesh");
    let meshIsFullscreen = true;
    let meshData: MeshData = makePrimitive("quad");
    let vertexSource = sn.vertexSource;
    let meshComputeNodeId: string | null = null;
    let meshComputeSourcePrim = 0;
    let meshComputeCount = 0;

    if (meshEdge) {
      const meshNode = graph.nodes.find((n) => n.id === meshEdge.source);
      if (meshNode && meshNode.kind === "mesh") {
        const md = meshDataFor(meshNode, assets);
        if (md) {
          meshData = md;
          meshIsFullscreen = false;
        }
      } else if (meshNode && meshNode.kind === "compute") {
        const cp = passByNode.get(meshNode.id);
        if (cp && cp.kind === "compute") {
          meshComputeNodeId = meshNode.id;
          meshIsFullscreen = false;
          meshComputeSourcePrim = cp.primitive;
          meshComputeCount = cp.count;
        }
      }
    }
    if (meshIsFullscreen) {
      vertexSource = fullscreenVert;
    }

    const built = createProgram(gl, vertexSource, sn.fragmentSource);
    if (built.errors.length) shaderErrors[sn.id] = built.errors;
    if (!built.program) continue;

    const fbo = createFramebuffer(gl, opts.width, opts.height);
    let mesh: GLMesh;
    let meshComputeVaos:
      | [WebGLVertexArrayObject, WebGLVertexArrayObject]
      | null = null;
    if (meshComputeNodeId) {
      const cp = passByNode.get(meshComputeNodeId) as ComputePass;
      const vaos = buildShaderComputeVaos(gl, built.program, cp);
      if (!vaos) {
        disposeFramebuffer(gl, fbo);
        disposeProgram(gl, built.program);
        shaderErrors[sn.id] = [
          ...(shaderErrors[sn.id] ?? []),
          {
            stage: "link",
            message: "Failed to allocate compute-driven VAO for shader",
            raw: "",
          },
        ];
        continue;
      }
      meshComputeVaos = vaos;
      // Synthesize a GLMesh whose `vao` will be swapped each frame in execute.
      mesh = {
        vao: vaos[0],
        vbos: [],
        ibo: null,
        indexType: gl.UNSIGNED_SHORT,
        indexCount: 0,
        vertexCount: meshComputeCount,
        primitive: meshComputeSourcePrim,
      };
    } else {
      mesh = uploadMesh(gl, meshData, built.program.attributes);
    }

    // Routing inputs: classify each incoming edge as sampler (texture) vs
    // parameter (scalar/vec). Texture edges become sampler bindings; param
    // edges override uniform values at draw time.
    const samplers: SamplerBinding[] = [];
    const paramBindings: ParamBinding[] = [];
    let unit = 0;
    for (const e of findEdgesToTarget(graph, sn.id)) {
      if (e.targetHandle === "mesh") continue;
      const src = graph.nodes.find((n) => n.id === e.source);
      if (!src) continue;
      if (
        src.kind === "param" ||
        src.kind === "math" ||
        src.kind === "swizzle" ||
        src.kind === "combine"
      ) {
        paramBindings.push({
          uniformName: e.targetHandle,
          sourceNodeId: e.source,
        });
      } else {
        samplers.push({
          uniformName: e.targetHandle,
          sourceNodeId: e.source,
          unit: unit++,
        });
      }
    }

    const pass: ShaderPass = {
      kind: "shader",
      nodeId: sn.id,
      program: built.program,
      fbo,
      mesh,
      meshIsFullscreen,
      meshComputeNodeId,
      meshComputeVaos,
      samplers,
      paramBindings,
      uniformValues: { ...sn.uniformValues },
    };
    passes.push(pass);
    passByNode.set(sn.id, pass);
    const passLocal = pass;
    disposers.push(() => {
      disposeProgram(gl, passLocal.program);
      disposeFramebuffer(gl, passLocal.fbo);
      if (passLocal.meshComputeVaos) {
        gl.deleteVertexArray(passLocal.meshComputeVaos[0]);
        gl.deleteVertexArray(passLocal.meshComputeVaos[1]);
      } else {
        disposeMesh(gl, passLocal.mesh);
      }
    });
  }

  const outputNodes = graph.nodes.filter((n) => n.kind === "output");
  const outputs: OutputBinding[] = outputNodes.map((o) => {
    const edge = findEdgeTo(graph, o.id, "texture");
    return { outputNodeId: o.id, sourceNodeId: edge?.source ?? null };
  });

  return {
    passes,
    imageTextures,
    outputs,
    outputNodeId: outputs[0]?.outputNodeId ?? null,
    outputSourceNodeId: outputs[0]?.sourceNodeId ?? null,
    errors,
    shaderErrors,
    width: opts.width,
    height: opts.height,
    hasCompute: passes.some((p) => p.kind === "compute"),
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}

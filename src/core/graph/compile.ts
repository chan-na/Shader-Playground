import { createProgram, disposeProgram, type CompiledProgram, type ShaderError } from '../gl/program';
import { createFramebuffer, disposeFramebuffer, type Framebuffer } from '../gl/framebuffer';
import { uploadMesh, disposeMesh, type GLMesh, type MeshData } from '../gl/mesh';
import { createImageTexture, disposeTexture, type GLTexture } from '../gl/texture';
import type { Graph, GraphNode, ShaderGraphNode, MeshGraphNode, ImageGraphNode } from './types';
import { topologicalOrder, validateGraph, type ValidationError } from './validate';
import { makePrimitive } from '../assets/primitives';
import type { GeometryHandle, ImageHandle } from '../assets/types';
import fullscreenVert from '../../shaders/fullscreen.vert?raw';

export interface AssetCatalog {
  meshes: Record<string, GeometryHandle>;
  images: Record<string, ImageHandle>;
}

const EMPTY_ASSETS: AssetCatalog = { meshes: {}, images: {} };

export interface SamplerBinding {
  uniformName: string;
  sourceNodeId: string;
  unit: number;
}

export interface ParamBinding {
  uniformName: string;
  sourceNodeId: string;
}

export interface ShaderPass {
  nodeId: string;
  program: CompiledProgram;
  fbo: Framebuffer;
  mesh: GLMesh;
  meshIsFullscreen: boolean;
  samplers: SamplerBinding[];
  /** Edges that override a uniform's value with a parameter node. */
  paramBindings: ParamBinding[];
  uniformValues: Record<string, number | number[]>;
}

export interface OutputBinding {
  outputNodeId: string;
  sourceNodeId: string | null;
}

export interface ExecutionPlan {
  passes: ShaderPass[];
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
    dispose: () => {},
  };
}

function findEdgeTo(graph: Graph, target: string, handle: string) {
  return graph.edges.find((e) => e.target === target && e.targetHandle === handle);
}

function findEdgesToTarget(graph: Graph, target: string) {
  return graph.edges.filter((e) => e.target === target);
}

function meshDataFor(node: GraphNode, assets: AssetCatalog): MeshData | null {
  if (node.kind !== 'mesh') return null;
  const mn = node as MeshGraphNode;
  if (mn.assetId) {
    const handle = assets.meshes[mn.assetId];
    if (handle) return handle.data;
    // Asset not yet loaded — fall through to primitive fallback.
  }
  return makePrimitive(mn.primitive);
}

export function compileGraph(
  gl: WebGL2RenderingContext,
  graph: Graph,
  opts: CompileOptions,
): ExecutionPlan {
  const assets = opts.assets ?? EMPTY_ASSETS;
  const errors = validateGraph(graph);
  const shaderErrors: Record<string, ShaderError[]> = {};
  const fatal = errors.some((e) => e.code === 'cycle' || e.code === 'multi_input' || e.code === 'multiple_outputs');
  if (fatal) {
    return { ...emptyPlan(opts.width, opts.height), errors };
  }

  const ordered = topologicalOrder(graph);
  const shaderNodes = ordered.filter((n): n is ShaderGraphNode => n.kind === 'shader');

  const passes: ShaderPass[] = [];
  const disposers: Array<() => void> = [];

  // Upload any image textures referenced by ImageNodes so ShaderNodes can
  // sample them through the existing sampler-routing path.
  const imageTextures: Record<string, GLTexture> = {};
  for (const node of graph.nodes) {
    if (node.kind !== 'image') continue;
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

  // Build a pass per shader node in topo order
  const passByNode = new Map<string, ShaderPass>();
  for (const sn of shaderNodes) {
    // Determine mesh input
    const meshEdge = findEdgeTo(graph, sn.id, 'mesh');
    let meshIsFullscreen = true;
    let meshData: MeshData = makePrimitive('quad');
    let vertexSource = sn.vertexSource;

    if (meshEdge) {
      const meshNode = graph.nodes.find((n) => n.id === meshEdge.source);
      if (meshNode && meshNode.kind === 'mesh') {
        const md = meshDataFor(meshNode, assets);
        if (md) {
          meshData = md;
          meshIsFullscreen = false;
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
    const mesh = uploadMesh(gl, meshData, built.program.attributes);

    // Routing inputs: classify each incoming edge as sampler (texture) vs
    // parameter (scalar/vec). Texture edges become sampler bindings; param
    // edges override uniform values at draw time.
    const samplers: SamplerBinding[] = [];
    const paramBindings: ParamBinding[] = [];
    let unit = 0;
    for (const e of findEdgesToTarget(graph, sn.id)) {
      if (e.targetHandle === 'mesh') continue;
      const src = graph.nodes.find((n) => n.id === e.source);
      if (!src) continue;
      if (src.kind === 'param') {
        paramBindings.push({ uniformName: e.targetHandle, sourceNodeId: e.source });
      } else {
        samplers.push({ uniformName: e.targetHandle, sourceNodeId: e.source, unit: unit++ });
      }
    }

    const pass: ShaderPass = {
      nodeId: sn.id,
      program: built.program,
      fbo,
      mesh,
      meshIsFullscreen,
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
      disposeMesh(gl, passLocal.mesh);
    });
  }

  const outputNodes = graph.nodes.filter((n) => n.kind === 'output');
  const outputs: OutputBinding[] = outputNodes.map((o) => {
    const edge = findEdgeTo(graph, o.id, 'texture');
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
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}


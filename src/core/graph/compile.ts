import { createProgram, disposeProgram, type CompiledProgram, type ShaderError } from '../gl/program';
import { createFramebuffer, disposeFramebuffer, type Framebuffer } from '../gl/framebuffer';
import { uploadMesh, disposeMesh, type GLMesh, type MeshData } from '../gl/mesh';
import type { Graph, GraphNode, ShaderGraphNode, MeshGraphNode } from './types';
import { topologicalOrder, validateGraph, type ValidationError } from './validate';
import { makePrimitive } from '../assets/primitives';
import fullscreenVert from '../../shaders/fullscreen.vert?raw';

export interface SamplerBinding {
  uniformName: string;
  sourceNodeId: string;
  unit: number;
}

export interface ShaderPass {
  nodeId: string;
  program: CompiledProgram;
  fbo: Framebuffer;
  mesh: GLMesh;
  meshIsFullscreen: boolean;
  samplers: SamplerBinding[];
  uniformValues: Record<string, number | number[]>;
}

export interface ExecutionPlan {
  passes: ShaderPass[];
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
}

export function emptyPlan(width: number, height: number): ExecutionPlan {
  return {
    passes: [],
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

function meshDataFor(node: GraphNode): MeshData | null {
  if (node.kind === 'mesh') {
    return makePrimitive((node as MeshGraphNode).primitive);
  }
  return null;
}

export function compileGraph(
  gl: WebGL2RenderingContext,
  graph: Graph,
  opts: CompileOptions,
): ExecutionPlan {
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
        const md = meshDataFor(meshNode);
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

    // Sampler bindings: any edge with targetHandle starting with sampler/u_tex
    const samplers: SamplerBinding[] = [];
    let unit = 0;
    for (const e of findEdgesToTarget(graph, sn.id)) {
      if (e.targetHandle === 'mesh') continue;
      samplers.push({ uniformName: e.targetHandle, sourceNodeId: e.source, unit: unit++ });
    }

    const pass: ShaderPass = {
      nodeId: sn.id,
      program: built.program,
      fbo,
      mesh,
      meshIsFullscreen,
      samplers,
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

  const output = graph.nodes.find((n) => n.kind === 'output') ?? null;
  let outputSourceNodeId: string | null = null;
  if (output) {
    const edge = findEdgeTo(graph, output.id, 'texture');
    if (edge) outputSourceNodeId = edge.source;
  }

  return {
    passes,
    outputNodeId: output?.id ?? null,
    outputSourceNodeId,
    errors,
    shaderErrors,
    width: opts.width,
    height: opts.height,
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}


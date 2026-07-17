import { assertNever } from "../../utils/assertNever";
import type {
  CombineArity,
  CombineGraphNode,
  ComputeGraphNode,
  GraphNode,
  GraphNodeKind,
  MathGraphNode,
  MathOp,
  ParamGraphNode,
  ParamKind,
  PortType,
  ShaderGraphNode,
  SwizzleGraphNode,
} from "../graph/types";
import { MATH_UNARY_OPS } from "../graph/types";
import {
  inspectorUniforms,
  parseUniforms,
  samplerUniforms,
} from "../graph/uniformParser";
import { isValidSwizzleMask } from "./utility";

export interface PortSpec {
  name: string;
  type: PortType;
}

export interface NodeKindMeta {
  kind: GraphNodeKind;
  label: string;
  inputs: (node: ShaderGraphNode | ComputeGraphNode | null) => PortSpec[];
  outputs: () => PortSpec[];
}

/** Map a GLSL uniform type to the corresponding edge port type. */
export function uniformTypeToPort(type: string): PortType | null {
  switch (type) {
    case "float":
      return "float";
    case "vec2":
      return "vec2";
    case "vec3":
      return "vec3";
    case "vec4":
      return "vec4";
    default:
      return null;
  }
}

export function paramOutputPort(paramKind: ParamKind): PortSpec {
  switch (paramKind) {
    case "float":
    case "time":
      return { name: "value", type: "float" };
    case "vec3":
    case "color":
      return { name: "value", type: "vec3" };
  }
}

export const NODE_META: Record<GraphNodeKind, NodeKindMeta> = {
  mesh: {
    kind: "mesh",
    label: "Mesh",
    inputs: () => [],
    outputs: () => [{ name: "mesh", type: "mesh" }],
  },
  image: {
    kind: "image",
    label: "Image",
    inputs: () => [],
    outputs: () => [{ name: "texture", type: "texture" }],
  },
  webcam: {
    kind: "webcam",
    label: "Webcam",
    inputs: () => [],
    outputs: () => [{ name: "texture", type: "texture" }],
  },
  video: {
    kind: "video",
    label: "Video",
    inputs: () => [],
    outputs: () => [{ name: "texture", type: "texture" }],
  },
  audio: {
    kind: "audio",
    label: "Audio",
    inputs: () => [],
    outputs: () => [{ name: "texture", type: "texture" }],
  },
  shader: {
    kind: "shader",
    label: "Shader",
    inputs: (sn) => {
      const ports: PortSpec[] = [{ name: "mesh", type: "mesh" }];
      if (sn && sn.kind === "shader") {
        const specs = parseUniforms(`${sn.vertexSource}\n${sn.fragmentSource}`);
        for (const s of samplerUniforms(specs)) {
          ports.push({ name: s.name, type: "texture" });
        }
        for (const s of inspectorUniforms(specs)) {
          const t = uniformTypeToPort(s.type);
          if (t) ports.push({ name: s.name, type: t });
        }
      }
      return ports;
    },
    outputs: () => [{ name: "texture", type: "texture" }],
  },
  compute: {
    kind: "compute",
    label: "Compute",
    inputs: (cn) => {
      // ComputeNode exposes only non-sampler uniforms from the vertex source
      // as input ports. sampler/mesh inputs are intentionally disallowed —
      // compute is positioned as a first-stage simulator, not a post pass.
      const ports: PortSpec[] = [];
      if (cn && cn.kind === "compute") {
        const specs = parseUniforms(cn.vertexSource);
        for (const s of inspectorUniforms(specs)) {
          const t = uniformTypeToPort(s.type);
          if (t) ports.push({ name: s.name, type: t });
        }
      }
      return ports;
    },
    outputs: () => [{ name: "mesh", type: "mesh" }],
  },
  output: {
    kind: "output",
    label: "Output",
    inputs: () => [{ name: "texture", type: "texture" }],
    outputs: () => [],
  },
  param: {
    kind: "param",
    label: "Parameter",
    inputs: () => [],
    // The actual output type depends on the param kind. Callers that need
    // per-instance accuracy should use paramOutputPort(node.paramKind).
    outputs: () => [{ name: "value", type: "float" }],
  },
  math: {
    kind: "math",
    label: "Math",
    // Binary ops surface (a,b); unary ops expose just (a). The runtime
    // evaluator ignores any edge connected to a port that isn't listed here.
    inputs: () => [
      { name: "a", type: "float" },
      { name: "b", type: "float" },
    ],
    outputs: () => [{ name: "value", type: "float" }],
  },
  swizzle: {
    kind: "swizzle",
    label: "Swizzle",
    inputs: () => [{ name: "in", type: "vec4" }],
    outputs: () => [{ name: "value", type: "vec4" }],
  },
  combine: {
    kind: "combine",
    label: "Combine",
    inputs: () => [
      { name: "x", type: "float" },
      { name: "y", type: "float" },
      { name: "z", type: "float" },
      { name: "w", type: "float" },
    ],
    outputs: () => [{ name: "value", type: "vec4" }],
  },
  group: {
    // Pure UI container — no ports. compile/validate ignore it entirely.
    kind: "group",
    label: "Group",
    inputs: () => [],
    outputs: () => [],
  },
};

/**
 * Resolve a node's display name for card titles / pane labels / export
 * filenames [D15·A-1·A-2]. Precedence:
 *  1. `group` — `label` is the single source of truth; a group node has no
 *     independent `name` concept, so `name` is never consulted here. The
 *     Inspector's common Name field routes group renames into `label`
 *     (graphStore.renameNode), so there is still exactly one title per node.
 *  2. user-set `name` (trimmed; blank-after-trim is treated as unset).
 *  3. the static `NODE_META[kind].label`.
 *
 * The former `param.label` step is gone [A-1]: a param is renamed through
 * `name` like every other kind, and projectSanitize migrates legacy values.
 */
export function displayNodeName(node: GraphNode): string {
  if (node.kind === "group") return node.label;
  const trimmed = node.name?.trim();
  if (trimmed) return trimmed;
  return NODE_META[node.kind].label;
}

/** Math-node port surface depends on the chosen op (unary vs binary). */
export function mathInputPorts(op: MathOp): PortSpec[] {
  if (MATH_UNARY_OPS.has(op)) return [{ name: "a", type: "float" }];
  return [
    { name: "a", type: "float" },
    { name: "b", type: "float" },
  ];
}

/** Swizzle output port type depends on the mask length. */
export function swizzleOutputPort(mask: string): PortSpec {
  if (!isValidSwizzleMask(mask)) return { name: "value", type: "float" };
  if (mask.length === 1) return { name: "value", type: "float" };
  if (mask.length === 2) return { name: "value", type: "vec2" };
  if (mask.length === 3) return { name: "value", type: "vec3" };
  return { name: "value", type: "vec4" };
}

/** Combine input ports surface only as many channels as the arity asks for. */
export function combineInputPorts(arity: CombineArity): PortSpec[] {
  const all: PortSpec[] = [
    { name: "x", type: "float" },
    { name: "y", type: "float" },
    { name: "z", type: "float" },
    { name: "w", type: "float" },
  ];
  return all.slice(0, arity);
}

/** Combine output type tracks the arity (vec2/vec3/vec4). */
export function combineOutputPort(arity: CombineArity): PortSpec {
  if (arity === 2) return { name: "value", type: "vec2" };
  if (arity === 3) return { name: "value", type: "vec3" };
  return { name: "value", type: "vec4" };
}

/**
 * Deep-clone a graph node into a fresh object with a narrow shape (no extra
 * keys). Centralized here so that adding a new GraphNodeKind surfaces as a
 * compile error on the exhaustiveness check, instead of silent fallthrough
 * in callers such as `serializeProject` / `deserializeProject`.
 */
export function cloneGraphNode(n: GraphNode): GraphNode {
  const cloned = cloneGraphNodeByKind(n);
  return n.name === undefined ? cloned : { ...cloned, name: n.name };
}

function cloneGraphNodeByKind(n: GraphNode): GraphNode {
  switch (n.kind) {
    case "mesh":
      return {
        id: n.id,
        kind: "mesh",
        primitive: n.primitive,
        assetId: n.assetId ?? null,
      };
    case "image":
      return { id: n.id, kind: "image", assetId: n.assetId ?? null };
    case "webcam":
      return {
        id: n.id,
        kind: "webcam",
        ...(n.deviceId !== undefined && { deviceId: n.deviceId }),
      };
    case "video":
      return {
        id: n.id,
        kind: "video",
        assetId: n.assetId ?? null,
        playing: n.playing,
        loop: n.loop,
        muted: n.muted,
        ...(n.currentTime !== undefined && { currentTime: n.currentTime }),
      };
    case "audio":
      return {
        id: n.id,
        kind: "audio",
        sourceKind: n.sourceKind,
        assetId: n.assetId ?? null,
        fftSize: n.fftSize,
        smoothing: n.smoothing,
        playing: n.playing,
        loop: n.loop,
      };
    case "shader":
      return {
        id: n.id,
        kind: "shader",
        vertexSource: n.vertexSource,
        fragmentSource: n.fragmentSource,
        uniformValues: cloneUniformValues(n.uniformValues),
        ...(n.resolutionScale !== undefined && {
          resolutionScale: n.resolutionScale,
        }),
      };
    case "compute":
      return {
        id: n.id,
        kind: "compute",
        vertexSource: n.vertexSource,
        count: n.count,
        primitive: n.primitive,
        attributes: n.attributes.map((a) => ({
          inName: a.inName,
          outName: a.outName,
          size: a.size,
          seed: a.seed,
        })),
        uniformValues: cloneUniformValues(n.uniformValues),
      };
    case "output":
      return { id: n.id, kind: "output" };
    case "param":
      return {
        id: n.id,
        kind: "param",
        paramKind: n.paramKind,
        value: Array.isArray(n.value) ? [...n.value] : n.value,
      };
    case "math":
      return { id: n.id, kind: "math", op: n.op, a: n.a, b: n.b };
    case "swizzle":
      return { id: n.id, kind: "swizzle", mask: n.mask };
    case "combine":
      return {
        id: n.id,
        kind: "combine",
        arity: n.arity,
        values: [n.values[0], n.values[1], n.values[2], n.values[3]],
      };
    case "group":
      return {
        id: n.id,
        kind: "group",
        label: n.label,
        width: n.width,
        height: n.height,
        ...(n.color !== undefined && { color: n.color }),
        ...(n.collapsed !== undefined && { collapsed: n.collapsed }),
      };
    default:
      return assertNever(n);
  }
}

function cloneUniformValues(
  uv: Record<string, number | number[]>,
): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = {};
  for (const [k, v] of Object.entries(uv)) {
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

/**
 * Per-instance input port surface. Falls back to the static NODE_META entry
 * for node kinds whose ports do not depend on configuration.
 */
export function nodeInputPorts(node: GraphNode): PortSpec[] {
  if (node.kind === "math") return mathInputPorts((node as MathGraphNode).op);
  if (node.kind === "combine")
    return combineInputPorts((node as CombineGraphNode).arity);
  if (node.kind === "shader")
    return NODE_META.shader.inputs(node as ShaderGraphNode);
  if (node.kind === "compute")
    return NODE_META.compute.inputs(node as ComputeGraphNode);
  return NODE_META[node.kind].inputs(null);
}

/**
 * Per-instance output port surface. Routes around the dummy "vec4" default of
 * Swizzle/Combine so connection validation reflects the real output type.
 */
export function nodeOutputPorts(node: GraphNode): PortSpec[] {
  if (node.kind === "param")
    return [paramOutputPort((node as ParamGraphNode).paramKind)];
  if (node.kind === "swizzle")
    return [swizzleOutputPort((node as SwizzleGraphNode).mask)];
  if (node.kind === "combine")
    return [combineOutputPort((node as CombineGraphNode).arity)];
  return NODE_META[node.kind].outputs();
}

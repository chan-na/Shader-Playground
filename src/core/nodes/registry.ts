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
};

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

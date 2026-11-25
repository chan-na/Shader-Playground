// Test-only node factories. Each returns the minimal valid node of its kind
// with neutral defaults (empty sources, no uniforms, one-vertex compute, cube
// mesh); a test overrides only the fields its assertion depends on, so the
// override list doubles as documentation of what the case is about.
import type {
  ComputeGraphNode,
  GraphNode,
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
} from "./types";

type Overrides<T> = Partial<Omit<T, "id" | "kind">>;
type OutputGraphNode = Extract<GraphNode, { kind: "output" }>;

export function shaderNode(
  id: string,
  overrides: Overrides<ShaderGraphNode> = {},
): ShaderGraphNode {
  return {
    id,
    kind: "shader",
    vertexSource: "",
    fragmentSource: "",
    uniformValues: {},
    ...overrides,
  };
}

export function computeNode(
  id: string,
  overrides: Overrides<ComputeGraphNode> = {},
): ComputeGraphNode {
  return {
    id,
    kind: "compute",
    vertexSource: "",
    count: 1,
    primitive: "POINTS",
    attributes: [],
    uniformValues: {},
    ...overrides,
  };
}

export function meshNode(
  id: string,
  overrides: Overrides<MeshGraphNode> = {},
): MeshGraphNode {
  return { id, kind: "mesh", primitive: "cube", ...overrides };
}

export function paramNode(
  id: string,
  overrides: Overrides<ParamGraphNode> = {},
): ParamGraphNode {
  return { id, kind: "param", paramKind: "float", value: 0, ...overrides };
}

export function outputNode(id: string): OutputGraphNode {
  return { id, kind: "output" };
}

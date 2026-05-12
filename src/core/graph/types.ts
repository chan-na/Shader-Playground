export type PortType = "mesh" | "texture" | "float" | "vec2" | "vec3" | "vec4";

export type GraphNodeKind =
  | "mesh"
  | "image"
  | "shader"
  | "compute"
  | "output"
  | "param"
  | "math"
  | "swizzle"
  | "combine";

export type ParamKind = "float" | "vec3" | "color" | "time";

interface BaseNode {
  id: string;
  kind: GraphNodeKind;
}

export interface MeshGraphNode extends BaseNode {
  kind: "mesh";
  // Either a built-in primitive name OR an assetId referencing a loaded
  // custom mesh in the asset store. `primitive` and `assetId` are mutually
  // exclusive; when `assetId` is set, `primitive` is ignored.
  primitive: "cube" | "sphere" | "plane" | "torus" | "quad";
  assetId?: string | null;
}

export interface ImageGraphNode extends BaseNode {
  kind: "image";
  assetId: string | null;
}

export interface ShaderGraphNode extends BaseNode {
  kind: "shader";
  vertexSource: string;
  fragmentSource: string;
  uniformValues: Record<string, number | number[]>;
}

interface OutputGraphNode extends BaseNode {
  kind: "output";
}

export interface ParamGraphNode extends BaseNode {
  kind: "param";
  paramKind: ParamKind;
  /** Current value. For 'time' it's [scale, offset] applied to simTime. */
  value: number | number[];
  label?: string;
}

export type MathOp =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "pow"
  | "abs"
  | "sin"
  | "cos";

export const MATH_UNARY_OPS: ReadonlySet<MathOp> = new Set([
  "abs",
  "sin",
  "cos",
]);

export interface MathGraphNode extends BaseNode {
  kind: "math";
  op: MathOp;
  /** Fallback values for `a` and `b` when no edge is connected. */
  a: number;
  b: number;
}

export interface SwizzleGraphNode extends BaseNode {
  kind: "swizzle";
  /** Component order, drawn from x/y/z/w. Output arity = mask.length (1..4). */
  mask: string;
}

export type CombineArity = 2 | 3 | 4;

export interface CombineGraphNode extends BaseNode {
  kind: "combine";
  arity: CombineArity;
  /** Fallback values for the four component channels. */
  values: [number, number, number, number];
}

/** Built-in seed generators for ComputeNode attribute initial data. */
export type ComputeSeed = "sphere" | "cube" | "random" | "zero";

/** Output primitive when the downstream ShaderNode draws compute results. */
export type ComputePrimitive = "POINTS" | "LINES" | "TRIANGLES";

export type ComputeAttributeSize = 1 | 2 | 3 | 4;

/**
 * One ping-pong attribute slot of a ComputeNode. `inName` is the GLSL `in`
 * attribute the vertex shader reads from; `outName` is the `out` varying
 * captured into the next-frame buffer for the same slot. They must differ —
 * WebGL2 forbids identical attribute/varying names in one program.
 */
export interface ComputeAttribute {
  inName: string;
  outName: string;
  size: ComputeAttributeSize;
  seed: ComputeSeed;
}

export interface ComputeGraphNode extends BaseNode {
  kind: "compute";
  /** Vertex shader that runs under transform feedback. */
  vertexSource: string;
  /** Number of vertices dispatched per frame. */
  count: number;
  /** Output primitive for downstream ShaderNode draw calls. */
  primitive: ComputePrimitive;
  /** Ping-pong attribute pairs. Order matters — defines the TF varying list. */
  attributes: ComputeAttribute[];
  uniformValues: Record<string, number | number[]>;
}

export type GraphNode =
  | MeshGraphNode
  | ImageGraphNode
  | ShaderGraphNode
  | ComputeGraphNode
  | OutputGraphNode
  | ParamGraphNode
  | MathGraphNode
  | SwizzleGraphNode
  | CombineGraphNode;

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

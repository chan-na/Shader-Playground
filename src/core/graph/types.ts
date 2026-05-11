export type PortType = "mesh" | "texture" | "float" | "vec2" | "vec3" | "vec4";

export interface Port {
  name: string;
  type: PortType;
}

export type GraphNodeKind =
  | "mesh"
  | "image"
  | "shader"
  | "output"
  | "param"
  | "math"
  | "swizzle"
  | "combine";

export type ParamKind = "float" | "vec3" | "color" | "time";

export interface BaseNode {
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

export interface OutputGraphNode extends BaseNode {
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

export type SwizzleVecKind = "vec2" | "vec3" | "vec4";

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

export type GraphNode =
  | MeshGraphNode
  | ImageGraphNode
  | ShaderGraphNode
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

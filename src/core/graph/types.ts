export type PortType = 'mesh' | 'texture';

export interface Port {
  name: string;
  type: PortType;
}

export type GraphNodeKind = 'mesh' | 'image' | 'shader' | 'output';

export interface BaseNode {
  id: string;
  kind: GraphNodeKind;
}

export interface MeshGraphNode extends BaseNode {
  kind: 'mesh';
  // Either a built-in primitive name OR an assetId referencing a loaded
  // custom mesh in the asset store. `primitive` and `assetId` are mutually
  // exclusive; when `assetId` is set, `primitive` is ignored.
  primitive: 'cube' | 'sphere' | 'plane' | 'torus' | 'quad';
  assetId?: string | null;
}

export interface ImageGraphNode extends BaseNode {
  kind: 'image';
  assetId: string | null;
}

export interface ShaderGraphNode extends BaseNode {
  kind: 'shader';
  vertexSource: string;
  fragmentSource: string;
  uniformValues: Record<string, number | number[]>;
}

export interface OutputGraphNode extends BaseNode {
  kind: 'output';
}

export type GraphNode =
  | MeshGraphNode
  | ImageGraphNode
  | ShaderGraphNode
  | OutputGraphNode;

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

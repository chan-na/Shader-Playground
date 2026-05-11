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
  primitive: 'cube' | 'sphere' | 'plane' | 'torus' | 'quad';
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

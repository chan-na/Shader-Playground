import { create } from 'zustand';

export type NodeKind = 'mesh' | 'image' | 'shader' | 'output';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  addNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node] })),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    })),
  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),
  addEdge: (edge) =>
    set((s) => ({ edges: [...s.edges, edge] })),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  reset: () => set({ nodes: [], edges: [] }),
}));

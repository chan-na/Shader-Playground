import { create } from 'zustand';
import type {
  Graph,
  GraphEdge,
  GraphNode,
  ShaderGraphNode,
} from '../core/graph/types';

export interface NodePosition {
  x: number;
  y: number;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
  rev: number; // bumped on structural change (re-compile trigger)
  uniformRev: number; // bumped on uniform-only change

  setGraph: (g: Graph, positions?: Record<string, NodePosition>) => void;
  addNode: (node: GraphNode, position?: NodePosition) => void;
  removeNode: (id: string) => void;
  updateNodePosition: (id: string, position: NodePosition) => void;
  updateShaderSource: (
    id: string,
    patch: { vertexSource?: string; fragmentSource?: string },
  ) => void;
  setUniformValue: (id: string, name: string, value: number | number[]) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  positions: {},
  rev: 0,
  uniformRev: 0,
  setGraph: (g, positions) =>
    set((s) => ({
      nodes: g.nodes,
      edges: g.edges,
      positions: positions ?? s.positions,
      rev: s.rev + 1,
    })),
  addNode: (node, position) =>
    set((s) => ({
      nodes: [...s.nodes, node],
      positions: position
        ? { ...s.positions, [node.id]: position }
        : s.positions,
      rev: s.rev + 1,
    })),
  removeNode: (id) =>
    set((s) => {
      const positions = { ...s.positions };
      delete positions[id];
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        positions,
        rev: s.rev + 1,
      };
    }),
  updateNodePosition: (id, position) =>
    set((s) => ({ positions: { ...s.positions, [id]: position } })),
  updateShaderSource: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== 'shader') return n;
        const sn = n as ShaderGraphNode;
        return {
          ...sn,
          vertexSource: patch.vertexSource ?? sn.vertexSource,
          fragmentSource: patch.fragmentSource ?? sn.fragmentSource,
        };
      }),
      rev: s.rev + 1,
    })),
  setUniformValue: (id, name, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id || n.kind !== 'shader') return n;
        const sn = n as ShaderGraphNode;
        return {
          ...sn,
          uniformValues: { ...sn.uniformValues, [name]: value },
        };
      }),
      uniformRev: s.uniformRev + 1,
    })),
  addEdge: (edge) =>
    set((s) => ({ edges: [...s.edges, edge], rev: s.rev + 1 })),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id), rev: s.rev + 1 })),
  reset: () =>
    set((s) => ({
      nodes: [],
      edges: [],
      positions: {},
      rev: s.rev + 1,
      uniformRev: 0,
    })),
}));

export function snapshotGraph(): Graph {
  const s = useGraphStore.getState();
  return { nodes: s.nodes, edges: s.edges };
}

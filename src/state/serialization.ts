import type { Graph, GraphEdge, GraphNode } from '../core/graph/types';
import type { NodePosition } from './graphStore';
import { validateGraph } from '../core/graph/validate';

export const PROJECT_FORMAT_VERSION = 1;

export interface SerializedProject {
  format: 'shader-playground';
  version: number;
  exportedAt: string;
  graph: Graph;
  positions: Record<string, NodePosition>;
}

export function serializeProject(
  graph: Graph,
  positions: Record<string, NodePosition>,
): SerializedProject {
  // Strip any positions that don't correspond to a current node.
  const knownIds = new Set(graph.nodes.map((n) => n.id));
  const trimmedPositions: Record<string, NodePosition> = {};
  for (const [id, p] of Object.entries(positions)) {
    if (knownIds.has(id)) trimmedPositions[id] = { x: p.x, y: p.y };
  }
  return {
    format: 'shader-playground',
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    graph: {
      nodes: graph.nodes.map((n) => structuredCloneNode(n)),
      edges: graph.edges.map((e) => structuredCloneEdge(e)),
    },
    positions: trimmedPositions,
  };
}

export interface DeserializedProject {
  graph: Graph;
  positions: Record<string, NodePosition>;
  warnings: string[];
}

export function deserializeProject(raw: unknown): DeserializedProject {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    throw new Error('Project payload is not an object');
  }
  const obj = raw as Partial<SerializedProject> & Record<string, unknown>;
  if (obj.format !== 'shader-playground') {
    throw new Error('Unrecognized project format');
  }
  if (typeof obj.version !== 'number') {
    throw new Error('Project version is missing');
  }
  if (obj.version > PROJECT_FORMAT_VERSION) {
    warnings.push(
      `Project version ${obj.version} is newer than supported ${PROJECT_FORMAT_VERSION}; loading anyway`,
    );
  }
  const graph = obj.graph as Graph | undefined;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Project graph is missing or malformed');
  }
  const positions = (obj.positions ?? {}) as Record<string, NodePosition>;
  const errors = validateGraph(graph);
  for (const e of errors) {
    if (e.code === 'missing_node' || e.code === 'multiple_outputs') {
      warnings.push(`Validation: ${e.message}`);
    }
  }
  return {
    graph: {
      nodes: graph.nodes.map((n) => structuredCloneNode(n)),
      edges: graph.edges.map((e) => structuredCloneEdge(e)),
    },
    positions,
    warnings,
  };
}

function structuredCloneNode(n: GraphNode): GraphNode {
  // Hand-rolled to keep the shape narrow and avoid leaking unrelated keys.
  switch (n.kind) {
    case 'mesh':
      return {
        id: n.id,
        kind: 'mesh',
        primitive: n.primitive,
        assetId: n.assetId ?? null,
      };
    case 'image':
      return { id: n.id, kind: 'image', assetId: n.assetId ?? null };
    case 'shader':
      return {
        id: n.id,
        kind: 'shader',
        vertexSource: n.vertexSource,
        fragmentSource: n.fragmentSource,
        uniformValues: deepCloneUniformValues(n.uniformValues),
      };
    case 'output':
      return { id: n.id, kind: 'output' };
    case 'param':
      return {
        id: n.id,
        kind: 'param',
        paramKind: n.paramKind,
        value: Array.isArray(n.value) ? [...n.value] : n.value,
        label: n.label,
      };
  }
}

function structuredCloneEdge(e: GraphEdge): GraphEdge {
  return {
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
  };
}

function deepCloneUniformValues(uv: Record<string, number | number[]>) {
  const out: Record<string, number | number[]> = {};
  for (const [k, v] of Object.entries(uv)) {
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

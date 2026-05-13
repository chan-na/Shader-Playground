import type { Graph, GraphEdge } from "../core/graph/types";
import { validateGraph } from "../core/graph/validate";
import { cloneGraphNode } from "../core/nodes/registry";
import type { NodePosition } from "./types";

export const PROJECT_FORMAT_VERSION = 1;

export interface SerializedProject {
  format: "shader-playground";
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
    format: "shader-playground",
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    graph: {
      nodes: graph.nodes.map((n) => cloneGraphNode(n)),
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
  if (!raw || typeof raw !== "object") {
    throw new Error("Project payload is not an object");
  }
  const obj = raw as Partial<SerializedProject> & Record<string, unknown>;
  if (obj.format !== "shader-playground") {
    throw new Error("Unrecognized project format");
  }
  if (typeof obj.version !== "number") {
    throw new Error("Project version is missing");
  }
  if (obj.version > PROJECT_FORMAT_VERSION) {
    warnings.push(
      `Project version ${obj.version} is newer than supported ${PROJECT_FORMAT_VERSION}; loading anyway`,
    );
  }
  const graph = obj.graph as Graph | undefined;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Project graph is missing or malformed");
  }
  const positions = (obj.positions ?? {}) as Record<string, NodePosition>;
  const errors = validateGraph(graph);
  for (const e of errors) {
    if (e.code === "missing_node" || e.code === "multiple_outputs") {
      warnings.push(`Validation: ${e.message}`);
    }
  }
  return {
    graph: {
      nodes: graph.nodes.map((n) => cloneGraphNode(n)),
      edges: graph.edges.map((e) => structuredCloneEdge(e)),
    },
    positions,
    warnings,
  };
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

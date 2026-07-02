import type { ParentsMap } from "../core/graph/parents";
import type { Graph, GraphEdge, GraphNode } from "../core/graph/types";
import { validateGraph } from "../core/graph/validate";
import { cloneGraphNode } from "../core/nodes/registry";
import {
  SANITIZE_LIMITS,
  sanitizeGraphEdge,
  sanitizeGraphNode,
} from "./projectSanitize";
import type { NodePosition } from "./types";

export const PROJECT_FORMAT_VERSION = 1;

export interface SerializedProject {
  format: "shader-playground";
  version: number;
  exportedAt: string;
  graph: Graph;
  positions: Record<string, NodePosition>;
  /**
   * Group nesting (Phase 29). Absent in pre-Phase-29 payloads — deserialize
   * treats a missing field as "no nesting" so older share URLs still load.
   */
  parents?: ParentsMap;
}

export function serializeProject(
  graph: Graph,
  positions: Record<string, NodePosition>,
  parents: ParentsMap = {},
): SerializedProject {
  // Strip any positions that don't correspond to a current node.
  const knownIds = new Set(graph.nodes.map((n) => n.id));
  const trimmedPositions: Record<string, NodePosition> = {};
  for (const [id, p] of Object.entries(positions)) {
    if (knownIds.has(id)) trimmedPositions[id] = { x: p.x, y: p.y };
  }
  // Strip parents entries pointing at unknown nodes, and drop self-cycles.
  const trimmedParents: ParentsMap = {};
  for (const [child, parent] of Object.entries(parents)) {
    if (!knownIds.has(child)) continue;
    if (!knownIds.has(parent)) continue;
    if (child === parent) continue;
    trimmedParents[child] = parent;
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
    parents: trimmedParents,
  };
}

export interface DeserializedProject {
  graph: Graph;
  positions: Record<string, NodePosition>;
  parents: ParentsMap;
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
  if (graph.nodes.length > SANITIZE_LIMITS.MAX_NODES) {
    throw new Error(
      `Project exceeds node limit (${SANITIZE_LIMITS.MAX_NODES})`,
    );
  }
  if (graph.edges.length > SANITIZE_LIMITS.MAX_EDGES) {
    throw new Error(
      `Project exceeds edge limit (${SANITIZE_LIMITS.MAX_EDGES})`,
    );
  }
  // Positions come from untrusted payloads too — validate the shape rather than
  // casting blind, so a malformed `{x:"a"}` / NaN can't reach React Flow.
  const rawPositions = (obj.positions ?? {}) as Record<string, unknown>;
  const positions: Record<string, NodePosition> = {};
  for (const [id, pos] of Object.entries(rawPositions)) {
    if (!pos || typeof pos !== "object") continue;
    const { x, y } = pos as { x?: unknown; y?: unknown };
    if (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
    ) {
      positions[id] = { x, y };
    } else {
      warnings.push(`Position dropped for ${id}: malformed coordinates`);
    }
  }

  const sanitizedNodes: GraphNode[] = [];
  for (const raw of graph.nodes) {
    const res = sanitizeGraphNode(raw);
    if (res.ok) sanitizedNodes.push(res.node);
    else warnings.push(`Node dropped: ${res.error}`);
  }
  const sanitizedEdges: GraphEdge[] = [];
  for (const raw of graph.edges) {
    const e = sanitizeGraphEdge(raw);
    if (e) sanitizedEdges.push(e);
    else warnings.push("Edge dropped: malformed shape");
  }
  const sanitizedGraph: Graph = {
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
  };

  const errors = validateGraph(sanitizedGraph);
  for (const e of errors) {
    if (e.code === "missing_node" || e.code === "multiple_outputs") {
      warnings.push(`Validation: ${e.message}`);
    }
  }

  // Sanitize parents: drop entries with unknown ids, self-cycles, and any
  // chain that loops. The walk caps at MAX_DEPTH to defend against malformed
  // payloads (e.g. handcrafted share URLs).
  const knownIds = new Set(sanitizedNodes.map((n) => n.id));
  const rawParents = (obj.parents ?? {}) as Record<string, unknown>;
  const candidates: Record<string, string> = {};
  for (const [child, parent] of Object.entries(rawParents)) {
    if (typeof parent !== "string") continue;
    if (!knownIds.has(child)) continue;
    if (!knownIds.has(parent)) continue;
    if (child === parent) continue;
    candidates[child] = parent;
  }
  const parents: ParentsMap = {};
  const MAX_DEPTH = 64;
  for (const child of Object.keys(candidates)) {
    let depth = 0;
    let cur: string | undefined = candidates[child];
    const seen = new Set<string>([child]);
    let cycle = false;
    while (cur !== undefined && depth < MAX_DEPTH) {
      if (seen.has(cur)) {
        cycle = true;
        break;
      }
      seen.add(cur);
      cur = candidates[cur];
      depth++;
    }
    // Accept when the walk reached the chain end (`cur === undefined`), even at
    // exactly MAX_DEPTH hops. Only a cycle, or a chain still continuing past the
    // cap (`cur !== undefined`), is dropped — the previous `depth < MAX_DEPTH`
    // test also discarded a valid acyclic chain of exactly MAX_DEPTH ancestors.
    if (!cycle && cur === undefined) {
      const p = candidates[child];
      if (p !== undefined) parents[child] = p;
    } else {
      warnings.push(`Parent chain for ${child} dropped (cycle or too deep)`);
    }
  }

  return {
    graph: sanitizedGraph,
    positions,
    parents,
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

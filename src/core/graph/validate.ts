import type { Graph, GraphEdge, GraphNode } from "./types";

export const MAX_OUTPUTS = 4;

export interface ValidationError {
  code: "cycle" | "multiple_outputs" | "multi_input" | "missing_node";
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

/**
 * The three codes that abort compilation outright: `compileGraph` returns an
 * `emptyPlan` without touching the GL layer when any of them is present, so
 * the resulting plan describes nothing. `missing_node` is deliberately absent
 * — a dangling edge is reported but compilation proceeds normally around it.
 *
 * Exported so UI that has to recognise "this plan is a transient blank, keep
 * showing the last real one" tests the same condition the compiler did.
 * Inferring it from the plan's shape instead (`passes.length === 0 &&
 * errors.length > 0`) is not equivalent: a graph whose only fault is a
 * `missing_node` and that legitimately produces zero passes reads as fatal
 * under that heuristic, freezing every plan-derived surface on stale data.
 */
export function isFatalValidation(errors: readonly ValidationError[]): boolean {
  return errors.some(
    (e) =>
      e.code === "cycle" ||
      e.code === "multi_input" ||
      e.code === "multiple_outputs",
  );
}

export function validateGraph(graph: Graph): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Edges referencing missing nodes
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      errors.push({
        code: "missing_node",
        message: `Edge ${e.id} references missing node`,
        edgeIds: [e.id],
      });
    }
  }

  // Output count — split viewport supports up to 4 outputs.
  const outputs = graph.nodes.filter((n) => n.kind === "output");
  if (outputs.length > MAX_OUTPUTS) {
    errors.push({
      code: "multiple_outputs",
      message: `Graph has ${outputs.length} Output nodes; max ${MAX_OUTPUTS} allowed`,
      nodeIds: outputs.map((o) => o.id),
    });
  }

  // N:1 forbidden — only one source per (target, targetHandle)
  const inputKey = (e: GraphEdge) => `${e.target}::${e.targetHandle}`;
  const seen = new Map<string, GraphEdge>();
  for (const e of graph.edges) {
    const k = inputKey(e);
    const prev = seen.get(k);
    if (prev) {
      errors.push({
        code: "multi_input",
        message: `Input ${k} has multiple sources`,
        edgeIds: [prev.id, e.id],
      });
    } else {
      seen.set(k, e);
    }
  }

  // Cycle detection (DFS)
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      adj.get(e.source)?.push(e.target);
    }
  }
  const VISITING = 1;
  const VISITED = 2;
  const state = new Map<string, number>();
  const dfs = (id: string, path: string[]): boolean => {
    const s = state.get(id);
    if (s === VISITING) {
      errors.push({
        code: "cycle",
        message: `Cycle detected: ${[...path, id].join(" -> ")}`,
        nodeIds: [...path, id],
      });
      return true;
    }
    if (s === VISITED) return false;
    state.set(id, VISITING);
    for (const nx of adj.get(id) ?? []) {
      if (dfs(nx, [...path, id])) return true;
    }
    state.set(id, VISITED);
    return false;
  };
  for (const n of graph.nodes) {
    if (!state.has(n.id)) dfs(n.id, []);
  }

  return errors;
}

export function topologicalOrder(graph: Graph): GraphNode[] {
  const indeg = new Map<string, number>();
  const byId = new Map<string, GraphNode>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    byId.set(n.id, n);
  }
  // Only edges whose *both* endpoints still exist take part in the sort.
  // Dangling edges (a node was deleted but an edge referencing it survived in a
  // stale/imported graph) must be excluded from the in-degree accumulation AND
  // from the drain walk — filtering just one of the two reintroduces the bug in
  // a different shape: a phantom target id gets pushed onto the queue and is
  // drained before real nodes, so a live node can be emitted ahead of the
  // dependency it samples. (#12)
  const live = graph.edges.filter(
    (e) => byId.has(e.source) && byId.has(e.target),
  );
  for (const e of live) {
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const out: GraphNode[] = [];
  while (queue.length) {
    // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guard above
    const id = queue.shift()!;
    const n = byId.get(id);
    if (n) out.push(n);
    for (const e of live) {
      if (e.source === id) {
        const d = (indeg.get(e.target) ?? 1) - 1;
        indeg.set(e.target, d);
        if (d === 0) queue.push(e.target);
      }
    }
  }
  return out;
}

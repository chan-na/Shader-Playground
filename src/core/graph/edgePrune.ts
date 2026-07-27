import { nodeInputPorts, nodeOutputPorts } from "../nodes/registry";
import type { GraphEdge, GraphNode } from "./types";

/**
 * Drop the edges that reference ports `node` no longer exposes.
 *
 * A node's port surface is derived from its editable state — a ShaderNode's
 * inputs come from its GLSL uniforms, a ComputeNode's from its vertex source,
 * Math's from its op, Combine's from its arity. Deleting a `uniform`, renaming
 * it, or switching an op therefore retires a port that edges may still point
 * at, and nothing else in the graph notices: `validateGraph` only checks node
 * ids, and `compileGraph` binds `e.targetHandle` as a uniform name without
 * asking whether that uniform exists.
 *
 * Such an edge is invisible but not inert. `execute` skips the unknown uniform
 * location, yet compile still counted the edge — a stale sampler edge consumes
 * a texture unit and keeps its upstream pass in the plan (rendering an FBO
 * nobody samples), and every stale edge remains a real dependency for
 * topological order and cycle detection, so the graph can refuse a legitimate
 * reverse connection because of a link the user can no longer see.
 *
 * Returns `edges` unchanged (same reference) when nothing is dropped, so store
 * subscribers keyed on edge identity don't re-render for a no-op edit.
 */
export function pruneEdgesForNode(
  node: GraphNode,
  edges: GraphEdge[],
): GraphEdge[] {
  const inputs = new Set(nodeInputPorts(node).map((p) => p.name));
  const outputs = new Set(nodeOutputPorts(node).map((p) => p.name));
  const kept = edges.filter((e) => {
    if (e.target === node.id && !inputs.has(e.targetHandle)) return false;
    if (e.source === node.id && !outputs.has(e.sourceHandle)) return false;
    return true;
  });
  return kept.length === edges.length ? edges : kept;
}

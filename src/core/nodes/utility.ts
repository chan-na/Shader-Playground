import type {
  CombineGraphNode,
  Graph,
  GraphNode,
  MathGraphNode,
  MathOp,
  ParamGraphNode,
  SwizzleGraphNode,
} from "../graph/types";
import { MATH_UNARY_OPS } from "../graph/types";

export type Scalar = number;
type Vec = number[];
export type Value = Scalar | Vec;

export interface EvalContext {
  /** Current simulated shader time (seconds). */
  time: number;
}

const MASK_INDEX: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };

/** Returns true if every character in `mask` is one of x/y/z/w. */
export function isValidSwizzleMask(mask: string): boolean {
  if (mask.length === 0 || mask.length > 4) return false;
  for (const c of mask) if (MASK_INDEX[c] === undefined) return false;
  return true;
}

function asVec(v: Value, fallbackLen = 4): Vec {
  if (Array.isArray(v)) {
    const out = v.slice();
    while (out.length < fallbackLen) out.push(0);
    return out;
  }
  // Broadcast a scalar across all channels.
  return new Array(fallbackLen).fill(v);
}

function asScalar(v: Value): Scalar {
  if (typeof v === "number") return v;
  return v[0] ?? 0;
}

export function applySwizzle(input: Value, mask: string): Value {
  const src = asVec(input, 4);
  const out: number[] = [];
  for (const c of mask) {
    const idx = MASK_INDEX[c];
    out.push(idx === undefined ? 0 : (src[idx] ?? 0));
  }
  if (out.length === 1) return out[0];
  return out;
}

export function computeMath(op: MathOp, a: Scalar, b: Scalar): Scalar {
  switch (op) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return b === 0 ? 0 : a / b;
    case "pow":
      return a ** b;
    case "abs":
      return Math.abs(a);
    case "sin":
      return Math.sin(a);
    case "cos":
      return Math.cos(a);
  }
}

function paramValue(node: ParamGraphNode, time: number): Value {
  if (node.paramKind === "time") {
    const [scale = 1, offset = 0] = Array.isArray(node.value)
      ? node.value
      : [node.value as number, 0];
    return time * scale + offset;
  }
  return node.value;
}

/**
 * Resolve the output value of any non-shader, non-texture node — recursively
 * following param/math/swizzle/combine edges. Memoised so a fan-out node is
 * only evaluated once per frame.
 *
 *   resolveValueFor('combine1', graph, ctx, new Map())
 *     → [0.3, 0.7, 1.0]  (e.g. three constant params combined into a vec3)
 *
 * Returns `0` for unknown nodes or shader/mesh/image/output sources
 * (those are routed through the texture/mesh paths, not value paths).
 */
export function resolveValueFor(
  nodeId: string,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Value {
  if (cache.has(nodeId)) return cache.get(nodeId) as Value;
  // Sentinel for recursion: zero. Cycle detection lives in validate.ts; we
  // pre-fill so a self-referential edge does not loop forever even if it slips
  // past validation.
  cache.set(nodeId, 0);

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return 0;

  const value = computeValueForNode(node, graph, ctx, cache);
  cache.set(nodeId, value);
  return value;
}

function computeValueForNode(
  node: GraphNode,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Value {
  if (node.kind === "param") {
    return paramValue(node as ParamGraphNode, ctx.time);
  }
  if (node.kind === "math") {
    return evalMath(node as MathGraphNode, graph, ctx, cache);
  }
  if (node.kind === "swizzle") {
    return evalSwizzle(node as SwizzleGraphNode, graph, ctx, cache);
  }
  if (node.kind === "combine") {
    return evalCombine(node as CombineGraphNode, graph, ctx, cache);
  }
  return 0;
}

function inputValue(
  targetId: string,
  handle: string,
  fallback: Value,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Value {
  const edge = graph.edges.find(
    (e) => e.target === targetId && e.targetHandle === handle,
  );
  if (!edge) return fallback;
  return resolveValueFor(edge.source, graph, ctx, cache);
}

function evalMath(
  node: MathGraphNode,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Scalar {
  const a = asScalar(inputValue(node.id, "a", node.a, graph, ctx, cache));
  if (MATH_UNARY_OPS.has(node.op)) return computeMath(node.op, a, 0);
  const b = asScalar(inputValue(node.id, "b", node.b, graph, ctx, cache));
  return computeMath(node.op, a, b);
}

function evalSwizzle(
  node: SwizzleGraphNode,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Value {
  const src = inputValue(node.id, "in", [0, 0, 0, 0], graph, ctx, cache);
  return applySwizzle(src, node.mask);
}

function evalCombine(
  node: CombineGraphNode,
  graph: Graph,
  ctx: EvalContext,
  cache: Map<string, Value>,
): Vec {
  const channels = ["x", "y", "z", "w"] as const;
  const out: number[] = [];
  for (let i = 0; i < node.arity; i++) {
    const v = inputValue(
      node.id,
      channels[i],
      node.values[i],
      graph,
      ctx,
      cache,
    );
    out.push(asScalar(v));
  }
  return out;
}

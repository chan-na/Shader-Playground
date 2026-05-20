import type {
  AudioFftSize,
  AudioGraphNode,
  AudioSourceKind,
  CombineArity,
  CombineGraphNode,
  ComputeAttribute,
  ComputeAttributeSize,
  ComputeGraphNode,
  ComputePrimitive,
  ComputeSeed,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  ImageGraphNode,
  MathGraphNode,
  MathOp,
  MeshGraphNode,
  ParamGraphNode,
  ParamKind,
  ShaderGraphNode,
  SwizzleGraphNode,
  VideoGraphNode,
  WebcamGraphNode,
} from "../core/graph/types";
import { AUDIO_FFT_SIZES } from "../core/graph/types";

/**
 * Hard caps for untrusted project payloads (share URL, imported JSON,
 * autosave). These bound the work that hydration / compileGraph will do
 * before touching the GPU. Numbers are generous relative to typical app
 * usage but tight enough to prevent quota / GPU memory blowups from
 * malicious or corrupted input.
 */
export const SANITIZE_LIMITS = {
  MAX_NODES: 2048,
  MAX_EDGES: 8192,
  MAX_SHADER_SOURCE_LEN: 64 * 1024,
  MAX_COMPUTE_COUNT: 1_000_000,
  MAX_COMPUTE_ATTRIBUTES: 16,
  MAX_ATTRIBUTE_NAME_LEN: 128,
  MAX_UNIFORM_KEYS: 64,
  MAX_UNIFORM_KEY_LEN: 128,
  MAX_UNIFORM_ARRAY_LEN: 16,
  MAX_PARAM_LABEL_LEN: 256,
  MAX_SWIZZLE_LEN: 4,
  MAX_DEVICE_ID_LEN: 256,
} as const;

const MESH_PRIMITIVES: ReadonlySet<MeshGraphNode["primitive"]> = new Set([
  "cube",
  "sphere",
  "plane",
  "torus",
  "quad",
]);
const COMPUTE_PRIMITIVES: ReadonlySet<ComputePrimitive> = new Set([
  "POINTS",
  "LINES",
  "TRIANGLES",
]);
const COMPUTE_SEEDS: ReadonlySet<ComputeSeed> = new Set([
  "sphere",
  "cube",
  "random",
  "zero",
]);
const PARAM_KINDS: ReadonlySet<ParamKind> = new Set([
  "float",
  "vec3",
  "color",
  "time",
]);
const MATH_OPS: ReadonlySet<MathOp> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "pow",
  "abs",
  "sin",
  "cos",
]);
const AUDIO_SOURCE_KINDS: ReadonlySet<AudioSourceKind> = new Set([
  "mic",
  "file",
]);
const AUDIO_FFT_SET: ReadonlySet<number> = new Set(AUDIO_FFT_SIZES);

function asObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function safeFiniteNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function safeShaderSource(v: unknown, field: string): string {
  if (typeof v !== "string") {
    throw new Error(`${field} must be a string`);
  }
  if (v.length > SANITIZE_LIMITS.MAX_SHADER_SOURCE_LEN) {
    throw new Error(
      `${field} exceeds ${SANITIZE_LIMITS.MAX_SHADER_SOURCE_LEN} chars`,
    );
  }
  return v;
}

function sanitizeUniformValues(
  raw: unknown,
): Record<string, number | number[]> {
  const src = asObject(raw);
  const out: Record<string, number | number[]> = {};
  if (!src) return out;
  let kept = 0;
  for (const [k, v] of Object.entries(src)) {
    if (kept >= SANITIZE_LIMITS.MAX_UNIFORM_KEYS) break;
    if (k.length > SANITIZE_LIMITS.MAX_UNIFORM_KEY_LEN) continue;
    if (typeof v === "number") {
      out[k] = safeFiniteNumber(v);
      kept++;
    } else if (Array.isArray(v)) {
      const arr = v
        .slice(0, SANITIZE_LIMITS.MAX_UNIFORM_ARRAY_LEN)
        .map((n) => safeFiniteNumber(n));
      out[k] = arr;
      kept++;
    }
  }
  return out;
}

function sanitizeComputeAttributes(raw: unknown): ComputeAttribute[] {
  if (!Array.isArray(raw)) return [];
  const out: ComputeAttribute[] = [];
  for (const item of raw.slice(0, SANITIZE_LIMITS.MAX_COMPUTE_ATTRIBUTES)) {
    const o = asObject(item);
    if (!o) continue;
    const inName = typeof o.inName === "string" ? o.inName : "";
    const outName = typeof o.outName === "string" ? o.outName : "";
    if (
      !inName ||
      !outName ||
      inName.length > SANITIZE_LIMITS.MAX_ATTRIBUTE_NAME_LEN ||
      outName.length > SANITIZE_LIMITS.MAX_ATTRIBUTE_NAME_LEN
    ) {
      continue;
    }
    const sizeRaw = o.size;
    const size: ComputeAttributeSize =
      sizeRaw === 1 || sizeRaw === 2 || sizeRaw === 3 || sizeRaw === 4
        ? sizeRaw
        : 1;
    const seedRaw = o.seed;
    const seed: ComputeSeed = COMPUTE_SEEDS.has(seedRaw as ComputeSeed)
      ? (seedRaw as ComputeSeed)
      : "zero";
    out.push({ inName, outName, size, seed });
  }
  return out;
}

function buildNode(raw: Record<string, unknown>, id: string): GraphNode {
  const kind = raw.kind as GraphNodeKind;
  switch (kind) {
    case "mesh": {
      const primitive: MeshGraphNode["primitive"] = MESH_PRIMITIVES.has(
        raw.primitive as MeshGraphNode["primitive"],
      )
        ? (raw.primitive as MeshGraphNode["primitive"])
        : "cube";
      const assetId = typeof raw.assetId === "string" ? raw.assetId : null;
      return { id, kind: "mesh", primitive, assetId };
    }
    case "image": {
      const assetId = typeof raw.assetId === "string" ? raw.assetId : null;
      const node: ImageGraphNode = { id, kind: "image", assetId };
      return node;
    }
    case "webcam": {
      const node: WebcamGraphNode = { id, kind: "webcam" };
      if (
        typeof raw.deviceId === "string" &&
        raw.deviceId.length <= SANITIZE_LIMITS.MAX_DEVICE_ID_LEN
      ) {
        node.deviceId = raw.deviceId;
      }
      return node;
    }
    case "video": {
      const assetId = typeof raw.assetId === "string" ? raw.assetId : null;
      const node: VideoGraphNode = {
        id,
        kind: "video",
        assetId,
        playing: typeof raw.playing === "boolean" ? raw.playing : true,
        loop: typeof raw.loop === "boolean" ? raw.loop : true,
        muted: typeof raw.muted === "boolean" ? raw.muted : true,
      };
      if (
        typeof raw.currentTime === "number" &&
        Number.isFinite(raw.currentTime)
      ) {
        // Clamp negative scrub values; upper bound depends on the file and is
        // re-clamped by the <video> element at apply time.
        node.currentTime = Math.max(0, raw.currentTime);
      }
      return node;
    }
    case "audio": {
      const sourceKind: AudioSourceKind = AUDIO_SOURCE_KINDS.has(
        raw.sourceKind as AudioSourceKind,
      )
        ? (raw.sourceKind as AudioSourceKind)
        : "mic";
      const assetId = typeof raw.assetId === "string" ? raw.assetId : null;
      const fftRaw =
        typeof raw.fftSize === "number" && AUDIO_FFT_SET.has(raw.fftSize)
          ? (raw.fftSize as AudioFftSize)
          : 256;
      const smoothingRaw = safeFiniteNumber(raw.smoothing, 0.8);
      const smoothing = Math.max(0, Math.min(1, smoothingRaw));
      const node: AudioGraphNode = {
        id,
        kind: "audio",
        sourceKind,
        assetId,
        fftSize: fftRaw,
        smoothing,
        playing: typeof raw.playing === "boolean" ? raw.playing : true,
        loop: typeof raw.loop === "boolean" ? raw.loop : true,
      };
      return node;
    }
    case "shader": {
      const vertexSource = safeShaderSource(
        raw.vertexSource,
        "shader.vertexSource",
      );
      const fragmentSource = safeShaderSource(
        raw.fragmentSource,
        "shader.fragmentSource",
      );
      const node: ShaderGraphNode = {
        id,
        kind: "shader",
        vertexSource,
        fragmentSource,
        uniformValues: sanitizeUniformValues(raw.uniformValues),
      };
      if (
        raw.resolutionScale === 0.25 ||
        raw.resolutionScale === 0.5 ||
        raw.resolutionScale === 1
      ) {
        node.resolutionScale = raw.resolutionScale;
      }
      return node;
    }
    case "compute": {
      const vertexSource = safeShaderSource(
        raw.vertexSource,
        "compute.vertexSource",
      );
      const countRaw = safeFiniteNumber(raw.count, 1);
      const count = Math.min(
        Math.max(Math.trunc(countRaw), 1),
        SANITIZE_LIMITS.MAX_COMPUTE_COUNT,
      );
      const primitive: ComputePrimitive = COMPUTE_PRIMITIVES.has(
        raw.primitive as ComputePrimitive,
      )
        ? (raw.primitive as ComputePrimitive)
        : "POINTS";
      const node: ComputeGraphNode = {
        id,
        kind: "compute",
        vertexSource,
        count,
        primitive,
        attributes: sanitizeComputeAttributes(raw.attributes),
        uniformValues: sanitizeUniformValues(raw.uniformValues),
      };
      return node;
    }
    case "output":
      return { id, kind: "output" };
    case "param": {
      const paramKind: ParamKind = PARAM_KINDS.has(raw.paramKind as ParamKind)
        ? (raw.paramKind as ParamKind)
        : "float";
      const v = raw.value;
      const value: number | number[] = Array.isArray(v)
        ? v
            .slice(0, SANITIZE_LIMITS.MAX_UNIFORM_ARRAY_LEN)
            .map((n) => safeFiniteNumber(n))
        : safeFiniteNumber(v);
      const node: ParamGraphNode = { id, kind: "param", paramKind, value };
      if (
        typeof raw.label === "string" &&
        raw.label.length <= SANITIZE_LIMITS.MAX_PARAM_LABEL_LEN
      ) {
        node.label = raw.label;
      }
      return node;
    }
    case "math": {
      const op: MathOp = MATH_OPS.has(raw.op as MathOp)
        ? (raw.op as MathOp)
        : "add";
      const node: MathGraphNode = {
        id,
        kind: "math",
        op,
        a: safeFiniteNumber(raw.a),
        b: safeFiniteNumber(raw.b),
      };
      return node;
    }
    case "swizzle": {
      const maskRaw = typeof raw.mask === "string" ? raw.mask : "x";
      const mask = maskRaw.slice(0, SANITIZE_LIMITS.MAX_SWIZZLE_LEN);
      const node: SwizzleGraphNode = { id, kind: "swizzle", mask };
      return node;
    }
    case "combine": {
      const arityRaw = raw.arity;
      const arity: CombineArity =
        arityRaw === 2 || arityRaw === 3 || arityRaw === 4 ? arityRaw : 4;
      const vs = Array.isArray(raw.values) ? raw.values : [];
      const values: [number, number, number, number] = [
        safeFiniteNumber(vs[0]),
        safeFiniteNumber(vs[1]),
        safeFiniteNumber(vs[2]),
        safeFiniteNumber(vs[3]),
      ];
      const node: CombineGraphNode = { id, kind: "combine", arity, values };
      return node;
    }
    default:
      throw new Error(`unknown node kind: ${String(kind)}`);
  }
}

export type SanitizeResult =
  | { ok: true; node: GraphNode }
  | { ok: false; error: string };

/**
 * Coerce a raw, untrusted node payload into a narrow GraphNode shape.
 *
 * - Drops or clamps soft violations (NaN/Infinity → 0, count out of range,
 *   too many uniforms, unknown enum value → safe default).
 * - Throws on hard violations that indicate a malicious / corrupt payload
 *   (oversized shader source, missing id, unknown kind). Caller surfaces
 *   the failure as a warning and skips the node.
 */
export function sanitizeGraphNode(raw: unknown): SanitizeResult {
  const obj = asObject(raw);
  if (!obj) return { ok: false, error: "node is not an object" };
  const id = obj.id;
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "node missing id" };
  }
  try {
    return { ok: true, node: buildNode(obj, id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid" };
  }
}

export function sanitizeGraphEdge(raw: unknown): GraphEdge | null {
  const o = asObject(raw);
  if (!o) return null;
  if (
    typeof o.id !== "string" ||
    typeof o.source !== "string" ||
    typeof o.sourceHandle !== "string" ||
    typeof o.target !== "string" ||
    typeof o.targetHandle !== "string"
  ) {
    return null;
  }
  return {
    id: o.id,
    source: o.source,
    sourceHandle: o.sourceHandle,
    target: o.target,
    targetHandle: o.targetHandle,
  };
}

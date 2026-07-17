export type PortType = "mesh" | "texture" | "float" | "vec2" | "vec3" | "vec4";

export type GraphNodeKind =
  | "mesh"
  | "image"
  | "webcam"
  | "video"
  | "audio"
  | "shader"
  | "compute"
  | "output"
  | "param"
  | "math"
  | "swizzle"
  | "combine"
  | "group";

/**
 * Hard caps for untrusted project payloads (share URL, imported JSON,
 * autosave). These bound the work that hydration / compileGraph will do
 * before touching the GPU. Numbers are generous relative to typical app
 * usage but tight enough to prevent quota / GPU memory blowups from
 * malicious or corrupted input.
 *
 * Lives here rather than in projectSanitize so that producers of these
 * values (graphStore's rename/edit actions) and the sanitizer that
 * re-validates them on load share one source of truth.
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
  MAX_NODE_NAME_LEN: 256,
  // [A-1] No MAX_PARAM_LABEL_LEN — `param.label` is gone, and the value
  // migrated into `name` is clamped by MAX_NODE_NAME_LEN like any other name.
  MAX_SWIZZLE_LEN: 4,
  MAX_DEVICE_ID_LEN: 256,
  MAX_GROUP_LABEL_LEN: 256,
  MAX_GROUP_DIMENSION: 8192,
  MAX_GROUP_COLOR_LEN: 16,
} as const;

/** Minimum size for a group node's content area (flow units). */
export const GROUP_MIN_WIDTH = 160;
export const GROUP_MIN_HEIGHT = 100;

/** Default size used when creating an empty group via the toolbar/palette. */
export const GROUP_DEFAULT_WIDTH = 320;
export const GROUP_DEFAULT_HEIGHT = 220;

/** Padding around the bounding box when grouping a selection. */
export const GROUP_SELECTION_PADDING = 32;

/**
 * Rendered height of a collapsed group — just the header bar. The stored
 * `height` is preserved so expanding restores the previous container size.
 */
export const GROUP_COLLAPSED_HEIGHT = 30;

/** Allowed AnalyserNode FFT sizes — must be a power of two within [32, 32768].
 *  Restricted to the typical set so the texture width stays in a sensible
 *  range and serialization can reject arbitrary numbers. */
export type AudioFftSize = 32 | 64 | 128 | 256 | 512 | 1024 | 2048;

export const AUDIO_FFT_SIZES: readonly AudioFftSize[] = [
  32, 64, 128, 256, 512, 1024, 2048,
] as const;

export type ParamKind = "float" | "vec3" | "color" | "time";

interface BaseNode {
  id: string;
  kind: GraphNodeKind;
  /**
   * 사용자 지정 표시명 [D15]. 미지정 시 표시 폴백은 displayNodeName()
   * (core/nodes/registry) 참조. 빈 문자열은 저장하지 않는다(부재=미지정).
   */
  name?: string;
}

export interface MeshGraphNode extends BaseNode {
  kind: "mesh";
  // Either a built-in primitive name OR an assetId referencing a loaded
  // custom mesh in the asset store. `primitive` and `assetId` are mutually
  // exclusive; when `assetId` is set, `primitive` is ignored.
  primitive: "cube" | "sphere" | "plane" | "torus" | "quad";
  assetId?: string | null;
}

export interface ImageGraphNode extends BaseNode {
  kind: "image";
  assetId: string | null;
}

export interface WebcamGraphNode extends BaseNode {
  kind: "webcam";
  /**
   * MediaDevices device ID. When undefined, the browser default camera is
   * requested. Persists across share/autosave but the user still has to grant
   * permission on each new origin/session.
   */
  deviceId?: string;
}

export interface VideoGraphNode extends BaseNode {
  kind: "video";
  /** Reference to the imported video asset; null until a file is bound. */
  assetId: string | null;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  /** Last-applied seek target (seconds). Optional so the inspector can leave
   *  the playhead alone unless the user explicitly scrubs. */
  currentTime?: number;
}

export type AudioSourceKind = "mic" | "file";

export interface AudioGraphNode extends BaseNode {
  kind: "audio";
  /** "mic" → getUserMedia({ audio: true }); "file" → decodeAudioData(blob). */
  sourceKind: AudioSourceKind;
  /** Asset id (file mode). Ignored when sourceKind === "mic". */
  assetId: string | null;
  /** AnalyserNode.fftSize — power of two from AUDIO_FFT_SIZES. */
  fftSize: AudioFftSize;
  /** AnalyserNode.smoothingTimeConstant — 0 (no smoothing) to 1 (max). */
  smoothing: number;
  /** File mode: whether the AudioBufferSourceNode is currently playing.
   *  Mic mode: ignored (the live stream is always "playing"). */
  playing: boolean;
  /** File mode: loop the AudioBufferSourceNode. Mic mode: ignored. */
  loop: boolean;
}

/**
 * Per-pass render resolution multiplier. The pass's FBO is allocated at
 * `round(canvas × scale)`; downstream passes still sample it through
 * normalized UVs, so a smaller scale produces a downsampled intermediate
 * (bloom / gaussian-pyramid style chains). Absent ⇒ treated as 1.
 */
export type ResolutionScale = 0.25 | 0.5 | 1;

export const RESOLUTION_SCALES: readonly ResolutionScale[] = [
  0.25, 0.5, 1,
] as const;

export interface ShaderGraphNode extends BaseNode {
  kind: "shader";
  vertexSource: string;
  fragmentSource: string;
  uniformValues: Record<string, number | number[]>;
  /** Render-target resolution multiplier (default 1 when omitted). */
  resolutionScale?: ResolutionScale;
}

interface OutputGraphNode extends BaseNode {
  kind: "output";
}

export interface ParamGraphNode extends BaseNode {
  kind: "param";
  paramKind: ParamKind;
  /** Current value. For 'time' it's [scale, offset] applied to simTime. */
  value: number | number[];
  // [A-1] No `label` — a param is renamed through the common `name` field like
  // every other kind. projectSanitize migrates pre-v1.2 `label` values.
}

export type MathOp =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "pow"
  | "abs"
  | "sin"
  | "cos";

export const MATH_UNARY_OPS: ReadonlySet<MathOp> = new Set([
  "abs",
  "sin",
  "cos",
]);

export interface MathGraphNode extends BaseNode {
  kind: "math";
  op: MathOp;
  /** Fallback values for `a` and `b` when no edge is connected. */
  a: number;
  b: number;
}

export interface SwizzleGraphNode extends BaseNode {
  kind: "swizzle";
  /** Component order, drawn from x/y/z/w. Output arity = mask.length (1..4). */
  mask: string;
}

export type CombineArity = 2 | 3 | 4;

export interface CombineGraphNode extends BaseNode {
  kind: "combine";
  arity: CombineArity;
  /** Fallback values for the four component channels. */
  values: [number, number, number, number];
}

/** Built-in seed generators for ComputeNode attribute initial data. */
export type ComputeSeed = "sphere" | "cube" | "random" | "zero";

/** Output primitive when the downstream ShaderNode draws compute results. */
export type ComputePrimitive = "POINTS" | "LINES" | "TRIANGLES";

export type ComputeAttributeSize = 1 | 2 | 3 | 4;

/**
 * One ping-pong attribute slot of a ComputeNode. `inName` is the GLSL `in`
 * attribute the vertex shader reads from; `outName` is the `out` varying
 * captured into the next-frame buffer for the same slot. They must differ —
 * WebGL2 forbids identical attribute/varying names in one program.
 */
export interface ComputeAttribute {
  inName: string;
  outName: string;
  size: ComputeAttributeSize;
  seed: ComputeSeed;
}

export interface ComputeGraphNode extends BaseNode {
  kind: "compute";
  /** Vertex shader that runs under transform feedback. */
  vertexSource: string;
  /** Number of vertices dispatched per frame. */
  count: number;
  /** Output primitive for downstream ShaderNode draw calls. */
  primitive: ComputePrimitive;
  /** Ping-pong attribute pairs. Order matters — defines the TF varying list. */
  attributes: ComputeAttribute[];
  uniformValues: Record<string, number | number[]>;
}

/**
 * Purely visual grouping node. Has no ports, never enters the ExecutionPlan,
 * and is ignored by validate/compile/execute. Children are tracked via the
 * graph store's `parents` map (childId → groupId) rather than a field here so
 * the relationship lives next to positions.
 */
export interface GroupGraphNode extends BaseNode {
  kind: "group";
  label: string;
  /** Optional hex color (e.g. "#3a7" or "#3388aa"); absent ⇒ default tint. */
  color?: string;
  /** Group container size in flow coordinates. */
  width: number;
  height: number;
  /**
   * When true the group renders as just its header bar and all descendant
   * nodes are hidden in the editor. Purely visual — the ExecutionPlan never
   * sees groups, so collapsing has zero render-path effect. Absent ⇒ expanded.
   */
  collapsed?: boolean;
}

export type GraphNode =
  | MeshGraphNode
  | ImageGraphNode
  | WebcamGraphNode
  | VideoGraphNode
  | AudioGraphNode
  | ShaderGraphNode
  | ComputeGraphNode
  | OutputGraphNode
  | ParamGraphNode
  | MathGraphNode
  | SwizzleGraphNode
  | CombineGraphNode
  | GroupGraphNode;

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

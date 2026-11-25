import type { PortRename } from "../core/graph/edgePrune";
import type { ParentsMap } from "../core/graph/parents";
import type {
  AudioFftSize,
  AudioSourceKind,
  CombineArity,
  ComputeAttribute,
  ComputePrimitive,
  Graph,
  GraphEdge,
  GraphNode,
  MathOp,
  MeshGraphNode,
  ResolutionScale,
} from "../core/graph/types";
import type { UniformHints } from "../core/graph/uniformParser";
import type { NodePosition } from "./types";

type GroupRemoveMode = "delete-children" | "release-children";

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, NodePosition>;
  /** Child → parent group id. Absent entry ⇒ top-level. */
  parents: ParentsMap;
  rev: number; // bumped on structural change (re-compile trigger)
  uniformRev: number; // bumped on uniform-only change
  /**
   * Bumped only when the graph is replaced *wholesale* — `setGraph` (demo
   * load, import, share/session restore), `reset` (Clear) and `applySnapshot`
   * (undo/redo). Incremental edits (add node, wire an edge, type in a shader)
   * bump `rev` but leave this alone.
   *
   * The node editor refits its viewport on this counter [#38]: keying the
   * refit on `rev` re-framed and animated the canvas after *every* structural
   * edit, so the view jumped away while the user was still working. Node count
   * is not a usable proxy either — the demo graph and `trivialMeshGraph()`
   * both have exactly 3 nodes, so a count-based trigger would silently drop
   * the refit on the share/restore path.
   */
  graphEpoch: number;

  setGraph: (
    g: Graph,
    positions?: Record<string, NodePosition>,
    parents?: ParentsMap,
  ) => void;
  addNode: (node: GraphNode, position?: NodePosition) => void;
  /**
   * Deep-clone a node under a fresh id, offset slightly from the original.
   * Edges are intentionally NOT duplicated. Returns the new id, or null when
   * the source id is unknown.
   */
  cloneNode: (id: string) => string | null;
  removeNode: (id: string) => void;
  /**
   * Set a node's user-facing display name [D15·A-2]. Trimmed and clamped to
   * `SANITIZE_LIMITS.MAX_NODE_NAME_LEN` (256). An empty result after
   * trimming removes the `name` property (falls back to the registry's
   * default display name) rather than storing `""`. No-op (no history push)
   * when the normalized name already matches the node's current name.
   *
   * Groups are renamed through this path too, so the Inspector can show one
   * common Name field for every kind — but the value is written to `label`,
   * a group's single source (also used by GroupNodeView's inline edit). A
   * blank rename is a no-op for groups, since `label` is non-optional.
   */
  renameNode: (id: string, name: string) => void;
  updateNodePosition: (id: string, position: NodePosition) => void;
  /**
   * Translate several nodes at once by (dx, dy) in flow coordinates. Used by
   * the arrow-key nudge for multi-selection. Like drags, this does not bump
   * `rev` or push history — node position is non-structural. Unknown ids are
   * ignored.
   */
  nudgeNodes: (ids: string[], dx: number, dy: number) => void;
  /**
   * Replace one or both GLSL stages of a ShaderNode.
   *
   * `rename` is the F2 refactor's exact old→new uniform pair. Pass it whenever
   * the patch is a rename: the node's port surface only shows "one port left,
   * another appeared", and without the pair the reconcile falls back to
   * inferring it from the surface (see `applyPortRename`). The pair is
   * validated against the new surface, so a hint for a non-uniform symbol is
   * simply ignored.
   */
  updateShaderSource: (
    id: string,
    patch: { vertexSource?: string; fragmentSource?: string },
    rename?: PortRename,
  ) => void;
  setUniformValue: (id: string, name: string, value: number | number[]) => void;
  /**
   * Write Inspector hint annotations (range/step/default/label) back into the
   * uniform declaration's GLSL source comment. Routes through the structural
   * source-update path so the change recompiles and re-derives the spec.
   */
  setUniformHints: (id: string, name: string, hints: UniformHints) => void;
  setResolutionScale: (id: string, scale: ResolutionScale) => void;
  setParamValue: (id: string, value: number | number[]) => void;
  setMathConfig: (
    id: string,
    patch: { op?: MathOp; a?: number; b?: number },
  ) => void;
  setSwizzleMask: (id: string, mask: string) => void;
  /**
   * Pick a MeshNode's built-in primitive, dropping any custom mesh asset it
   * was bound to (`primitive` and `assetId` are mutually exclusive).
   *
   * Targeted on purpose: the node view used to rebuild the whole graph through
   * `setGraph`, which resets `parents` to `{}` and so silently dissolved every
   * group as a side effect of changing a dropdown. Only `nodes` moves here.
   * No-op (no history push, no rev bump) for unknown / non-mesh ids.
   */
  setMeshPrimitive: (id: string, primitive: MeshGraphNode["primitive"]) => void;
  setCombineConfig: (
    id: string,
    patch: { arity?: CombineArity; values?: [number, number, number, number] },
  ) => void;
  updateComputeSource: (id: string, vertexSource: string) => void;
  setComputeConfig: (
    id: string,
    patch: {
      count?: number;
      primitive?: ComputePrimitive;
      attributes?: ComputeAttribute[];
    },
  ) => void;
  setWebcamConfig: (id: string, patch: { deviceId?: string }) => void;
  setVideoConfig: (
    id: string,
    patch: {
      assetId?: string | null;
      playing?: boolean;
      loop?: boolean;
      muted?: boolean;
      currentTime?: number;
    },
  ) => void;
  setAudioConfig: (
    id: string,
    patch: {
      sourceKind?: AudioSourceKind;
      assetId?: string | null;
      fftSize?: AudioFftSize;
      smoothing?: number;
      playing?: boolean;
      loop?: boolean;
    },
  ) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  reset: () => void;

  /**
   * Create a new group node at the given absolute position and size. Returns
   * the new node id. If `parentId` is given the group becomes a sub-group
   * (positions are converted to parent-relative).
   */
  addGroup: (
    label: string,
    absolutePosition: NodePosition,
    size: { width: number; height: number },
    options?: { parentId?: string; color?: string },
  ) => string;
  /**
   * Set or clear a node's parent. Maintains visual location by recomputing
   * the node's parent-relative position. Returns true on success, false when
   * the move would form a cycle or the node is unknown.
   */
  setParent: (id: string, newParentId: string | undefined) => boolean;
  /**
   * Wrap the given node ids in a new group sized to their bounding box.
   * Returns the new group id, or null when fewer than 1 node is provided or
   * none of the ids exist. The new group inherits the *common* parent of
   * the selection (nested groups arise naturally).
   */
  groupSelected: (ids: string[]) => string | null;
  /**
   * Remove a group node. `mode === 'delete-children'` cascades through
   * descendants; `'release-children'` promotes direct children up to the
   * group's own parent (or top-level) while preserving their absolute
   * positions. No-op if `id` is not a group node.
   */
  removeGroup: (id: string, mode: GroupRemoveMode) => void;
  setGroupLabel: (id: string, label: string) => void;
  setGroupColor: (id: string, color: string | undefined) => void;
  setGroupSize: (id: string, size: { width: number; height: number }) => void;
  /**
   * Flip a group between collapsed (header-only, descendants hidden) and
   * expanded. Structural-tier (rev + history) so the state is undoable and
   * auto-saved; recompile is a no-op since groups never enter the plan. No-op
   * when `id` is unknown or not a group.
   */
  toggleGroupCollapsed: (id: string) => void;

  /** Replace state without bumping history (used by undo/redo). Counts as a
   *  wholesale replace (`graphEpoch`), so stepping through history refits the
   *  editor viewport the same way loading a graph does. */
  applySnapshot: (snap: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Record<string, NodePosition>;
    parents: ParentsMap;
  }) => void;
}

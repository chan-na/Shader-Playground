import type { NodeProps } from "@xyflow/react";
import type { ComponentType } from "react";
import type { GraphNodeKind } from "../../core/graph/types";
import { AudioNodeView } from "./nodes/AudioNodeView";
import { ComputeNodeView } from "./nodes/ComputeNodeView";
import { GroupNodeView } from "./nodes/GroupNodeView";
import { ImageNodeView } from "./nodes/ImageNodeView";
import { MeshNodeView } from "./nodes/MeshNodeView";
import { OutputNodeView } from "./nodes/OutputNodeView";
import { ParamNodeView } from "./nodes/ParamNodeView";
import { ShaderNodeView } from "./nodes/ShaderNodeView";
import {
  CombineNodeView,
  MathNodeView,
  SwizzleNodeView,
} from "./nodes/UtilityNodeViews";
import { VideoNodeView } from "./nodes/VideoNodeView";
import { WebcamNodeView } from "./nodes/WebcamNodeView";

export interface NodeUiSpec {
  view: ComponentType<NodeProps>;
  minimapColor: string;
}

const FALLBACK_MINIMAP_COLOR = "#888888";

/**
 * UI-side registry per GraphNodeKind. Adding a new node kind surfaces here
 * as a compile error because the map is typed as exhaustive Record.
 */
export const NODE_UI: Record<GraphNodeKind, NodeUiSpec> = {
  mesh: { view: MeshNodeView, minimapColor: "#56d698" },
  image: { view: ImageNodeView, minimapColor: "#d69c56" },
  webcam: { view: WebcamNodeView, minimapColor: "#d65656" },
  video: { view: VideoNodeView, minimapColor: "#c156d6" },
  audio: { view: AudioNodeView, minimapColor: "#56c1d6" },
  shader: { view: ShaderNodeView, minimapColor: "#569cd6" },
  compute: { view: ComputeNodeView, minimapColor: FALLBACK_MINIMAP_COLOR },
  output: { view: OutputNodeView, minimapColor: "#d6569c" },
  param: { view: ParamNodeView, minimapColor: "#d6d656" },
  math: { view: MathNodeView, minimapColor: FALLBACK_MINIMAP_COLOR },
  swizzle: { view: SwizzleNodeView, minimapColor: FALLBACK_MINIMAP_COLOR },
  combine: { view: CombineNodeView, minimapColor: FALLBACK_MINIMAP_COLOR },
  group: { view: GroupNodeView, minimapColor: "#5b6a7a" },
};

/** ReactFlow `nodeTypes` prop derived from NODE_UI in a single pass. */
export const NODE_TYPES: Record<
  GraphNodeKind,
  ComponentType<NodeProps>
> = Object.fromEntries(
  (Object.entries(NODE_UI) as [GraphNodeKind, NodeUiSpec][]).map(
    ([kind, spec]) => [kind, spec.view],
  ),
) as Record<GraphNodeKind, ComponentType<NodeProps>>;

/** MiniMap color for a node `type` string (ReactFlow's untyped surface). */
export function minimapColorFor(kind: string | undefined): string {
  if (!kind) return FALLBACK_MINIMAP_COLOR;
  const entry = (NODE_UI as Record<string, NodeUiSpec | undefined>)[kind];
  return entry?.minimapColor ?? FALLBACK_MINIMAP_COLOR;
}

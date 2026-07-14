import type { NodeProps } from "@xyflow/react";
import type { ComponentType } from "react";
import type { GraphNodeKind } from "../../core/graph/types";
import { tokens } from "../../theme";
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
import { categoryHexFor } from "./nodeTheme";

export interface NodeUiSpec {
  view: ComponentType<NodeProps>;
  minimapColor: string;
}

const FALLBACK_MINIMAP_COLOR = tokens.text.muted;

/**
 * UI-side registry per GraphNodeKind. Adding a new node kind surfaces here
 * as a compile error because the map is typed as exhaustive Record.
 * minimapColor is derived from the node's category (design/Node Editor.dc.html
 * L280-293 미니맵 블록이 카테고리 5색만 사용) via categoryHexFor.
 */
export const NODE_UI: Record<GraphNodeKind, NodeUiSpec> = {
  mesh: { view: MeshNodeView, minimapColor: categoryHexFor("mesh") },
  image: { view: ImageNodeView, minimapColor: categoryHexFor("image") },
  webcam: { view: WebcamNodeView, minimapColor: categoryHexFor("webcam") },
  video: { view: VideoNodeView, minimapColor: categoryHexFor("video") },
  audio: { view: AudioNodeView, minimapColor: categoryHexFor("audio") },
  shader: { view: ShaderNodeView, minimapColor: categoryHexFor("shader") },
  compute: { view: ComputeNodeView, minimapColor: categoryHexFor("compute") },
  output: { view: OutputNodeView, minimapColor: categoryHexFor("output") },
  param: { view: ParamNodeView, minimapColor: categoryHexFor("param") },
  math: { view: MathNodeView, minimapColor: categoryHexFor("math") },
  swizzle: { view: SwizzleNodeView, minimapColor: categoryHexFor("swizzle") },
  combine: { view: CombineNodeView, minimapColor: categoryHexFor("combine") },
  group: { view: GroupNodeView, minimapColor: categoryHexFor("group") },
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

// Test-only helpers for mounting node-editor pieces. React Flow's <Handle>
// (and every port built on it) needs a ReactFlowProvider ancestor to mount, so
// node views and port handles cannot render bare.
import { render } from "@testing-library/react";
import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GraphNode } from "../../core/graph/types";

/** Client render (RTL) inside a ReactFlowProvider. Use when the test reads
 *  live store state or interacts with the DOM. */
export function renderInFlow(element: ReactElement) {
  return render(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** Static markup inside a ReactFlowProvider, for plain string assertions.
 *  Under `renderToStaticMarkup` zustand's useSyncExternalStore serves the
 *  store's *initial* snapshot, so a `setState()` made before rendering never
 *  shows up here — use `renderInFlow` for store-dependent output. */
export function renderInFlowStatic(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** The slice of NodeProps the node views read: `id` and `data.node`. React
 *  Flow's full NodeProps carries layout/drag fields the views never touch, so
 *  the stand-in is cast rather than filled in field by field. */
export function nodeProps(id: string, node: GraphNode): NodeProps {
  return { id, data: { node } } as unknown as NodeProps;
}

import {
  type ConnectionLineComponentProps,
  ConnectionLineType,
  Position,
  ReactFlowProvider,
} from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import { useGraphStore } from "../../state/graphStore";
import { tokens } from "../../theme";
import { ConnectionLine } from "./ConnectionLine";

/** ReactFlow's Handle requires ReactFlowProvider context to mount (see
 *  nodeViews.test.tsx). */
function renderInFlow(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

/** Minimal ConnectionLineComponentProps stand-in — only the fields
 *  ConnectionLine.tsx actually reads (fromX/Y, toX/Y, positions, fromNode.id,
 *  fromHandle.id/type) need real values; the rest of React Flow's internal
 *  node/handle shape is irrelevant here. */
function mockProps(
  fromNodeId: string,
  fromHandle: { id: string | null; type: "source" | "target" },
): ConnectionLineComponentProps {
  return {
    connectionLineType: ConnectionLineType.Bezier,
    fromNode: { id: fromNodeId },
    fromHandle: {
      nodeId: fromNodeId,
      id: fromHandle.id,
      type: fromHandle.type,
      x: 0,
      y: 0,
      position: Position.Right,
      width: 11,
      height: 11,
    },
    fromX: 0,
    fromY: 0,
    toX: 100,
    toY: 40,
    fromPosition: Position.Right,
    toPosition: Position.Left,
    connectionStatus: null,
    toNode: null,
    toHandle: null,
    pointer: { x: 100, y: 40 },
  } as unknown as ConnectionLineComponentProps;
}

const meshNode: MeshGraphNode = {
  id: "mesh1",
  kind: "mesh",
  primitive: "cube",
  assetId: null,
};

const paramFloatNode: ParamGraphNode = {
  id: "param1",
  kind: "param",
  paramKind: "float",
  value: 0.5,
};

const shaderNode: ShaderGraphNode = {
  id: "shader1",
  kind: "shader",
  vertexSource: "",
  fragmentSource: "uniform float u_x;",
  uniformValues: {},
};

describe("ConnectionLine", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useGraphStore.getState().addNode(meshNode, { x: 0, y: 0 });
    useGraphStore.getState().addNode(paramFloatNode, { x: 0, y: 0 });
    useGraphStore.getState().addNode(shaderNode, { x: 0, y: 0 });
  });
  afterEach(() => {
    useGraphStore.getState().reset();
  });

  it("always renders a dashed 2.5-width path with the sp-connection-line class", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("mesh1", { id: "mesh", type: "source" })}
      />,
    );
    expect(html).toContain('class="sp-connection-line"');
    expect(html).toContain('stroke-dasharray="6 6"');
    expect(html).toContain('stroke-width="2.5"');
    expect(html).toContain('fill="none"');
  });

  it("drag from a mesh output handle: resource family stroke", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("mesh1", { id: "mesh", type: "source" })}
      />,
    );
    expect(html).toContain(`stroke="${tokens.portFamily.resource}"`);
  });

  it("drag from a float param output handle: scalar family stroke", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("param1", { id: "value", type: "source" })}
      />,
    );
    expect(html).toContain(`stroke="${tokens.portFamily.scalar}"`);
  });

  it("drag from a shader's float uniform *input* handle: scalar family stroke (target-side lookup)", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("shader1", { id: "u_x", type: "target" })}
      />,
    );
    expect(html).toContain(`stroke="${tokens.portFamily.scalar}"`);
  });

  it("handle id not found on the node's port list: accent fallback", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("shader1", { id: "u_missing", type: "target" })}
      />,
    );
    expect(html).toContain(`stroke="${tokens.accent.default}"`);
  });

  it("fromNode not present in the graph store: accent fallback", () => {
    const html = renderInFlow(
      <ConnectionLine
        {...mockProps("missing-node", { id: "value", type: "source" })}
      />,
    );
    expect(html).toContain(`stroke="${tokens.accent.default}"`);
  });
});

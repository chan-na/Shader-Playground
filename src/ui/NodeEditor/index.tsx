import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import "@xyflow/react/dist/style.css";
import "./nodeCard.css";

import { validateGraph } from "../../core/graph/validate";
import { nodeInputPorts, nodeOutputPorts } from "../../core/nodes/registry";
import { importFiles } from "../../state/assetActions";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { nextId } from "../../utils/id";
import { HelpModal } from "./HelpModal";
import { minimapColorFor, NODE_TYPES } from "./nodeUiRegistry";
import { Toolbar } from "./Toolbar";

export function NodeEditor() {
  const graphNodes = useGraphStore((s) => s.nodes);
  const graphEdges = useGraphStore((s) => s.edges);
  const positions = useGraphStore((s) => s.positions);
  const rev = useGraphStore((s) => s.rev);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const removeNode = useGraphStore((s) => s.removeNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const select = useSelectionStore((s) => s.select);
  const setSelectedIds = useSelectionStore((s) => s.setSelectedIds);
  const selectedNodeIds = useSelectionStore((s) => s.selectedNodeIds);
  const flowRef = useRef<ReactFlowInstance | null>(null);

  // Auto-fit when the graph is replaced wholesale (Demo/Chain Demo/Clear) so
  // small graph panels still show every node. Triggered by rev bumps, not by
  // per-node drags (which don't bump rev).
  const prevCountRef = useRef(graphNodes.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rev is the intentional trigger for wholesale-graph-replace refits
  useEffect(() => {
    const inst = flowRef.current;
    if (!inst) return;
    if (graphNodes.length === 0) return;
    // Defer to next frame so the new node DOM has measured dimensions.
    const id = requestAnimationFrame(() => {
      inst.fitView({
        padding: 0.15,
        minZoom: 0.2,
        maxZoom: 1.0,
        duration: 200,
      });
    });
    prevCountRef.current = graphNodes.length;
    return () => cancelAnimationFrame(id);
  }, [rev, graphNodes.length]);

  const rfNodes: Node[] = useMemo(() => {
    const sel = new Set(selectedNodeIds);
    return graphNodes.map((n) => ({
      id: n.id,
      type: n.kind,
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { node: n },
      // React Flow v12 controlled mode: highlight is driven by this flag,
      // not by RF's internal state. Sync from selectionStore so clicks,
      // shift-box selects, pane-clears, and programmatic selects all reach
      // the DOM.
      selected: sel.has(n.id),
    }));
  }, [graphNodes, positions, selectedNodeIds]);

  const rfEdges: Edge[] = useMemo(
    () =>
      graphEdges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        animated: false,
        style: { stroke: "#888" },
      })),
    [graphEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Fold the whole batch into the running selection so shift-box selects
      // (which emit one select event per node) accumulate instead of the last
      // one clobbering the rest.
      let next = useSelectionStore.getState().selectedNodeIds;
      let touched = false;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          updateNodePosition(c.id, { x: c.position.x, y: c.position.y });
        } else if (c.type === "remove") {
          removeNode(c.id);
          if (next.includes(c.id)) {
            next = next.filter((id) => id !== c.id);
            touched = true;
          }
        } else if (c.type === "select") {
          touched = true;
          if (c.selected) {
            if (!next.includes(c.id)) next = [...next, c.id];
          } else {
            next = next.filter((id) => id !== c.id);
          }
        }
      }
      if (touched) setSelectedIds(next);
    },
    [updateNodePosition, removeNode, setSelectedIds],
  );

  const onPaneClick = useCallback(() => select(null), [select]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === "remove") removeEdge(c.id);
      }
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (
        !conn.source ||
        !conn.target ||
        !conn.sourceHandle ||
        !conn.targetHandle
      )
        return;

      // N:1 enforcement: refuse if target handle already has an edge
      const inUse = graphEdges.some(
        (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
      );
      if (inUse) return;

      // Type compatibility
      const srcNode = graphNodes.find((n) => n.id === conn.source);
      const tgtNode = graphNodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;
      const srcOut = nodeOutputPorts(srcNode).find(
        (p) => p.name === conn.sourceHandle,
      );
      const tgtIn = nodeInputPorts(tgtNode).find(
        (p) => p.name === conn.targetHandle,
      );
      if (!srcOut || !tgtIn || srcOut.type !== tgtIn.type) return;

      const newEdge = {
        id: nextId("e"),
        source: conn.source,
        sourceHandle: conn.sourceHandle,
        target: conn.target,
        targetHandle: conn.targetHandle,
      };
      // Cycle check on a hypothetical graph
      const tentative = {
        nodes: graphNodes,
        edges: [...graphEdges, newEdge],
      };
      if (validateGraph(tentative).some((e) => e.code === "cycle")) return;

      addEdge(newEdge);
    },
    [graphEdges, graphNodes, addEdge],
  );

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      const c = conn as Connection;
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle)
        return false;
      const srcNode = graphNodes.find((n) => n.id === c.source);
      const tgtNode = graphNodes.find((n) => n.id === c.target);
      if (!srcNode || !tgtNode) return false;
      const srcOut = nodeOutputPorts(srcNode).find(
        (p) => p.name === c.sourceHandle,
      );
      const tgtIn = nodeInputPorts(tgtNode).find(
        (p) => p.name === c.targetHandle,
      );
      if (!srcOut || !tgtIn) return false;
      return srcOut.type === tgtIn.type;
    },
    [graphNodes],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    const inst = flowRef.current;
    let pos: { x: number; y: number } | undefined;
    if (inst) {
      pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    }
    void importFiles(e.dataTransfer.files, pos);
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: file drop zone; keyboard alternative is the toolbar Import button
    <div className="panel panel--graph" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="panel-header">Node Graph</div>
      <Toolbar />
      <div className="panel-body" style={{ background: "#1a1a1a" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onInit={(inst) => {
            flowRef.current = inst;
          }}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background color="#333" gap={16} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => minimapColorFor((n as Node).type)}
            style={{ background: "#252526" }}
          />
        </ReactFlow>
      </div>
      <HelpModal />
    </div>
  );
}

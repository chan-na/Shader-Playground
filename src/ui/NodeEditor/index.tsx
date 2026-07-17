import {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./nodeCard.css";

import {
  getAbsolutePosition,
  hasCollapsedAncestor,
} from "../../core/graph/parents";
import type { GroupGraphNode } from "../../core/graph/types";
import { GROUP_COLLAPSED_HEIGHT } from "../../core/graph/types";
import { validateGraph } from "../../core/graph/validate";
import { nodeInputPorts, nodeOutputPorts } from "../../core/nodes/registry";
import { importFiles } from "../../state/assetActions";
import { useBootstrapStore } from "../../state/bootstrapStore";
import { useConnectionUiStore } from "../../state/connectionUiStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { nextId } from "../../utils/id";
import { DockPanelHeader } from "../DockPanelHeader";
import { MOTION_MAX_MS } from "../motion";
import { WelcomeOverlay } from "../WelcomeOverlay";
import { ConnectionLine } from "./ConnectionLine";
import { type EdgeVisualStyle, edgeStyleFor } from "./edgeTheme";
import { GraphSkeleton } from "./GraphSkeleton";
import { HelpModal } from "./HelpModal";
import { minimapColorFor, NODE_TYPES } from "./nodeUiRegistry";
import { createNodeDataCache } from "./rfNodeData";
import { ZoomControls } from "./ZoomControls";

/** Width/height approximation for non-group node cards when picking a target
 *  group on drag-stop. The real measurements come from the DOM but we don't
 *  need pixel accuracy — we just want the drop target picker to be forgiving.
 */
const DROP_CARD_W = 180;
const DROP_CARD_H = 64;

export function NodeEditor() {
  const bootPhase = useBootstrapStore((s) => s.phase);
  const graphNodes = useGraphStore((s) => s.nodes);
  const graphEdges = useGraphStore((s) => s.edges);
  const positions = useGraphStore((s) => s.positions);
  const parents = useGraphStore((s) => s.parents);
  const rev = useGraphStore((s) => s.rev);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const removeNode = useGraphStore((s) => s.removeNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const setParentAction = useGraphStore((s) => s.setParent);
  const select = useSelectionStore((s) => s.select);
  const setSelectedIds = useSelectionStore((s) => s.setSelectedIds);
  const selectedNodeIds = useSelectionStore((s) => s.selectedNodeIds);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  // Per-node `data` wrappers, stable across renders so React Flow only
  // re-renders the card whose graph node actually changed (see rfNodeData).
  // Lazily created once and kept for the component's lifetime.
  const nodeDataCacheRef = useRef<ReturnType<
    typeof createNodeDataCache
  > | null>(null);
  let nodeDataFor = nodeDataCacheRef.current;
  if (nodeDataFor === null) {
    nodeDataFor = createNodeDataCache();
    nodeDataCacheRef.current = nodeDataFor;
  }

  // React Flow v12's controlled mode never writes measured dimensions back
  // onto the `nodes` we pass in — it only reports them via onNodesChange's
  // "dimensions" changes. Without storing those and re-injecting them as
  // `node.measured`, every userNode fails @xyflow/react's nodeHasDimensions()
  // check, so MiniMap (which calls that check per node) filters every node
  // out and renders no category-color blocks at all.
  const [measuredSizes, setMeasuredSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});

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
        duration: MOTION_MAX_MS,
      });
    });
    prevCountRef.current = graphNodes.length;
    return () => cancelAnimationFrame(id);
  }, [rev, graphNodes.length]);

  const rfNodes: Node[] = useMemo(() => {
    const sel = new Set(selectedNodeIds);
    const collapsedGroupIds = new Set(
      graphNodes
        .filter((n) => n.kind === "group" && (n as GroupGraphNode).collapsed)
        .map((n) => n.id),
    );
    return graphNodes.map((n) => {
      const rf: Node = {
        id: n.id,
        type: n.kind,
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: nodeDataFor(n),
        // React Flow v12 controlled mode: highlight is driven by this flag,
        // not by RF's internal state. Sync from selectionStore so clicks,
        // shift-box selects, pane-clears, and programmatic selects all reach
        // the DOM.
        selected: sel.has(n.id),
      };
      // Descendants of any collapsed group are hidden (RF also drops their
      // connected edges). The collapsed group itself stays visible as a header.
      if (hasCollapsedAncestor(n.id, parents, collapsedGroupIds)) {
        rf.hidden = true;
      }
      const pid = parents[n.id];
      if (pid !== undefined) {
        rf.parentId = pid;
        // No `extent: 'parent'` here on purpose — we want drag-out to release
        // a child back to the top level (or into a sibling group) naturally
        // via onNodeDragStop. The visual leakage during the drag is brief and
        // the position is normalized on drop.
      }
      if (n.kind === "group") {
        const gn = n as GroupGraphNode;
        rf.style = {
          width: gn.width,
          height: gn.collapsed ? GROUP_COLLAPSED_HEIGHT : gn.height,
        };
      }
      const measured = measuredSizes[n.id];
      if (measured) {
        rf.measured = measured;
      }
      return rf;
    });
  }, [
    graphNodes,
    positions,
    parents,
    selectedNodeIds,
    nodeDataFor,
    measuredSizes,
  ]);

  const rfEdges: Edge[] = useMemo(
    () =>
      graphEdges.map((e) => {
        const style: EdgeVisualStyle = edgeStyleFor(e, graphNodes);
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
          animated: false,
          style,
        };
      }),
    [graphEdges, graphNodes],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Fold the whole batch into the running selection so shift-box selects
      // (which emit one select event per node) accumulate instead of the last
      // one clobbering the rest.
      let next = useSelectionStore.getState().selectedNodeIds;
      let touched = false;
      let dimensionsTouched = false;
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
        } else if (c.type === "dimensions" && c.dimensions) {
          dimensionsTouched = true;
        }
      }
      if (touched) setSelectedIds(next);
      if (dimensionsTouched) {
        setMeasuredSizes((prev) => {
          let changedAny = false;
          const merged = { ...prev };
          for (const c of changes) {
            if (c.type !== "dimensions" || !c.dimensions) continue;
            const existing = merged[c.id];
            if (
              existing &&
              existing.width === c.dimensions.width &&
              existing.height === c.dimensions.height
            ) {
              continue;
            }
            merged[c.id] = {
              width: c.dimensions.width,
              height: c.dimensions.height,
            };
            changedAny = true;
          }
          return changedAny ? merged : prev;
        });
      }
    },
    [updateNodePosition, removeNode, setSelectedIds],
  );

  const onPaneClick = useCallback(() => select(null), [select]);

  /**
   * After a drag releases, decide whether the moved node should reparent into
   * a group it now overlaps (or release from its current group when dropped
   * onto the canvas). Handles single drags AND multi-select drags by walking
   * the `nodes` argument that React Flow hands us.
   */
  const onNodeDragStop = useCallback<OnNodeDrag>(
    (_e, _node, nodes) => {
      const draggedNodes = nodes && nodes.length > 0 ? nodes : [_node];
      const state = useGraphStore.getState();
      // Pre-compute absolute boxes for every group node so the picker is O(n·g)
      // rather than O(n·g·depth).
      const groupBoxes = state.nodes
        .filter((n) => n.kind === "group")
        .map((g) => {
          const gn = g as GroupGraphNode;
          const abs = getAbsolutePosition(g.id, state.positions, state.parents);
          // A collapsed group only occupies its header visually; restrict the
          // drop hit-box to match so nodes don't reparent into empty space.
          const h = gn.collapsed ? GROUP_COLLAPSED_HEIGHT : gn.height;
          return {
            id: g.id,
            x1: abs.x,
            y1: abs.y,
            x2: abs.x + gn.width,
            y2: abs.y + h,
            area: gn.width * h,
          };
        });

      for (const dragged of draggedNodes) {
        const id = dragged.id;
        const node = state.nodes.find((n) => n.id === id);
        if (!node) continue;
        // Resolve where the node CENTER landed in absolute coordinates. The
        // RF event already wrote the new position into the store via
        // onNodesChange, so getAbsolutePosition picks up the latest value.
        const fresh = useGraphStore.getState();
        const abs = getAbsolutePosition(id, fresh.positions, fresh.parents);
        const w =
          node.kind === "group" ? (node as GroupGraphNode).width : DROP_CARD_W;
        const h =
          node.kind === "group" ? (node as GroupGraphNode).height : DROP_CARD_H;
        const cx = abs.x + w / 2;
        const cy = abs.y + h / 2;

        // Pick the smallest containing group whose interior holds the center
        // point. "Smallest" gives nested groups priority over outer ones.
        let bestId: string | undefined;
        let bestArea = Infinity;
        for (const g of groupBoxes) {
          if (g.id === id) continue; // a group never parents itself
          if (cx < g.x1 || cy < g.y1 || cx > g.x2 || cy > g.y2) continue;
          if (g.area < bestArea) {
            bestId = g.id;
            bestArea = g.area;
          }
        }

        const currentParent = fresh.parents[id];
        if (bestId !== currentParent) {
          // setParent will reject cycles (group landed inside its own
          // descendant) and quietly no-op when nothing changed.
          setParentAction(id, bestId);
        }
      }
    },
    [setParentAction],
  );

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
      useConnectionUiStore
        .getState()
        .triggerSnap(conn.target, conn.targetHandle);
    },
    [graphEdges, graphNodes, addEdge],
  );

  /**
   * Records the source port's side/type into connectionUiStore the moment a
   * drag starts, so fanout-highlight consumers (U3/U4) know what "compatible"
   * means for this drag. Looked up against the graph store (same pattern as
   * ConnectionLine's strokeForHandle) rather than React Flow's internal node
   * data.
   */
  const onConnectStart = useCallback<OnConnectStart>((_e, params) => {
    const { nodeId, handleId, handleType } = params;
    if (!nodeId || !handleId) return;
    const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const side = handleType === "source" ? ("out" as const) : ("in" as const);
    const ports = side === "out" ? nodeOutputPorts(node) : nodeInputPorts(node);
    const port = ports.find((p) => p.name === handleId);
    if (!port) return;
    useConnectionUiStore.getState().startDrag({
      nodeId,
      handleId,
      side,
      portType: port.type,
    });
  }, []);

  /** Always fires when a port drag ends, whether it resolved into a
   *  connection or was released over empty space — either way the drag is
   *  no longer in progress. */
  const onConnectEnd = useCallback<OnConnectEnd>(() => {
    useConnectionUiStore.getState().endDrag();
  }, []);

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
      <DockPanelHeader
        label="Node Editor"
        meta={`${graphNodes.length}N · ${graphEdges.length}E`}
        collapsedRail
      />
      <div className="panel-body" style={{ background: "var(--surface-app)" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeDragStop={onNodeDragStop}
          isValidConnection={isValidConnection}
          connectionLineComponent={ConnectionLine}
          onInit={(inst) => {
            flowRef.current = inst;
          }}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={2}
            color={tokens.overlay.gridDot}
          />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => minimapColorFor((n as Node).type)}
            nodeBorderRadius={2}
            maskColor={withAlpha(tokens.surface.app, 0.6)}
            style={{
              background: withAlpha(tokens.surface.app, 0.85),
              border: "1px solid var(--border-default)",
              borderRadius: tokens.radius.overlay,
              width: 168,
              height: 112,
            }}
          />
          <ZoomControls />
        </ReactFlow>
        {graphNodes.length === 0 &&
          (bootPhase !== "done" ? <GraphSkeleton /> : <WelcomeOverlay />)}
        {selectedNodeIds.length > 1 && (
          <div
            data-testid="selection-count-badge"
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              zIndex: 10,
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--accent-hover)",
              background: withAlpha(tokens.accent.default, 0.16),
              border: `1px solid ${withAlpha(tokens.accent.default, 0.4)}`,
              borderRadius: tokens.radius.chip,
              padding: "2px 8px",
              pointerEvents: "none",
            }}
          >
            {`${selectedNodeIds.length} nodes selected`}
          </div>
        )}
      </div>
      <HelpModal />
    </div>
  );
}

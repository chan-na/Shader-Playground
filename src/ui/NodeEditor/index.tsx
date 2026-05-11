import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './nodeCard.css';

import { useGraphStore } from '../../state/graphStore';
import { useSelectionStore } from '../../state/selectionStore';
import { Toolbar } from './Toolbar';
import { MeshNodeView } from './nodes/MeshNodeView';
import { ImageNodeView } from './nodes/ImageNodeView';
import { ShaderNodeView } from './nodes/ShaderNodeView';
import { OutputNodeView } from './nodes/OutputNodeView';
import { NODE_META } from '../../core/nodes/registry';
import { nextId } from '../../utils/id';
import type { ShaderGraphNode } from '../../core/graph/types';
import { validateGraph } from '../../core/graph/validate';

const nodeTypes = {
  mesh: MeshNodeView,
  image: ImageNodeView,
  shader: ShaderNodeView,
  output: OutputNodeView,
};

export function NodeEditor() {
  const graphNodes = useGraphStore((s) => s.nodes);
  const graphEdges = useGraphStore((s) => s.edges);
  const positions = useGraphStore((s) => s.positions);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const removeNode = useGraphStore((s) => s.removeNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const select = useSelectionStore((s) => s.select);

  const rfNodes: Node[] = useMemo(
    () =>
      graphNodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: { node: n },
      })),
    [graphNodes, positions],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      graphEdges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        animated: false,
        style: { stroke: '#888' },
      })),
    [graphEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes);
      // Persist position drags + removals
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          updateNodePosition(c.id, { x: c.position.x, y: c.position.y });
        } else if (c.type === 'remove') {
          removeNode(c.id);
        } else if (c.type === 'select') {
          if (c.selected) select(c.id);
        }
      }
      void updated;
    },
    [rfNodes, updateNodePosition, removeNode, select],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type === 'remove') removeEdge(c.id);
      }
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return;

      // N:1 enforcement: refuse if target handle already has an edge
      const inUse = graphEdges.some(
        (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
      );
      if (inUse) return;

      // Type compatibility
      const srcNode = graphNodes.find((n) => n.id === conn.source);
      const tgtNode = graphNodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;
      const srcOut = NODE_META[srcNode.kind].outputs().find((p) => p.name === conn.sourceHandle);
      const tgtIn = NODE_META[tgtNode.kind]
        .inputs(tgtNode.kind === 'shader' ? (tgtNode as ShaderGraphNode) : null)
        .find((p) => p.name === conn.targetHandle);
      if (!srcOut || !tgtIn || srcOut.type !== tgtIn.type) return;

      // Cycle check on a hypothetical graph
      const tentative = {
        nodes: graphNodes,
        edges: [
          ...graphEdges,
          {
            id: nextId('e'),
            source: conn.source,
            sourceHandle: conn.sourceHandle,
            target: conn.target,
            targetHandle: conn.targetHandle,
          },
        ],
      };
      if (validateGraph(tentative).some((e) => e.code === 'cycle')) return;

      addEdge(tentative.edges[tentative.edges.length - 1]);
    },
    [graphEdges, graphNodes, addEdge],
  );

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      const c = conn as Connection;
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return false;
      const srcNode = graphNodes.find((n) => n.id === c.source);
      const tgtNode = graphNodes.find((n) => n.id === c.target);
      if (!srcNode || !tgtNode) return false;
      const srcOut = NODE_META[srcNode.kind].outputs().find((p) => p.name === c.sourceHandle);
      const tgtIn = NODE_META[tgtNode.kind]
        .inputs(tgtNode.kind === 'shader' ? (tgtNode as ShaderGraphNode) : null)
        .find((p) => p.name === c.targetHandle);
      if (!srcOut || !tgtIn) return false;
      return srcOut.type === tgtIn.type;
    },
    [graphNodes],
  );

  return (
    <div className="panel panel--graph">
      <div className="panel-header">Node Graph</div>
      <Toolbar />
      <div className="panel-body" style={{ background: '#1a1a1a' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background color="#333" gap={16} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              switch ((n as Node).type) {
                case 'mesh':   return '#56d698';
                case 'image':  return '#d69c56';
                case 'shader': return '#569cd6';
                case 'output': return '#d6569c';
                default: return '#888';
              }
            }}
            style={{ background: '#252526' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}


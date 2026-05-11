import { useGraphStore } from '../../state/graphStore';

export function NodeEditor() {
  const nodeCount = useGraphStore((s) => s.nodes.length);
  const edgeCount = useGraphStore((s) => s.edges.length);

  return (
    <div className="panel panel--graph">
      <div className="panel-header">Node Graph</div>
      <div className="panel-body">
        <div className="placeholder-message">
          Node editor (Phase 5) — nodes: {nodeCount}, edges: {edgeCount}
        </div>
      </div>
    </div>
  );
}

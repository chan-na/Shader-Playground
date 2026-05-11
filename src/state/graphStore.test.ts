import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './graphStore';

describe('graphStore', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it('starts empty', () => {
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('addNode appends a node', () => {
    useGraphStore.getState().addNode({
      id: 'n1',
      kind: 'shader',
      position: { x: 0, y: 0 },
      data: {},
    });
    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().nodes[0].id).toBe('n1');
  });

  it('removeNode also removes connected edges', () => {
    const s = useGraphStore.getState();
    s.addNode({ id: 'a', kind: 'mesh', position: { x: 0, y: 0 }, data: {} });
    s.addNode({ id: 'b', kind: 'shader', position: { x: 0, y: 0 }, data: {} });
    s.addEdge({
      id: 'e1',
      source: 'a',
      sourceHandle: 'mesh',
      target: 'b',
      targetHandle: 'mesh',
    });
    expect(useGraphStore.getState().edges).toHaveLength(1);

    useGraphStore.getState().removeNode('a');
    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().edges).toHaveLength(0);
  });

  it('updateNode patches the matching node', () => {
    useGraphStore.getState().addNode({
      id: 'n1',
      kind: 'shader',
      position: { x: 0, y: 0 },
      data: { label: 'a' },
    });
    useGraphStore.getState().updateNode('n1', { position: { x: 100, y: 50 } });
    const n = useGraphStore.getState().nodes[0];
    expect(n.position).toEqual({ x: 100, y: 50 });
    expect(n.data.label).toBe('a');
  });

  it('removeEdge removes only the named edge', () => {
    const s = useGraphStore.getState();
    s.addEdge({ id: 'e1', source: 'a', sourceHandle: 'o', target: 'b', targetHandle: 'i' });
    s.addEdge({ id: 'e2', source: 'a', sourceHandle: 'o', target: 'c', targetHandle: 'i' });
    useGraphStore.getState().removeEdge('e1');
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e2']);
  });
});

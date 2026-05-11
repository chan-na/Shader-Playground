import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './graphStore';
import type { ShaderGraphNode } from '../core/graph/types';

const makeShader = (id: string, frag = 'void main(){}'): ShaderGraphNode => ({
  id,
  kind: 'shader',
  vertexSource: 'void main(){ gl_Position = vec4(0); }',
  fragmentSource: frag,
  uniformValues: {},
});

describe('graphStore', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it('starts empty', () => {
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('addNode appends and bumps rev', () => {
    const before = useGraphStore.getState().rev;
    useGraphStore.getState().addNode(makeShader('n1'), { x: 10, y: 20 });
    const after = useGraphStore.getState();
    expect(after.nodes).toHaveLength(1);
    expect(after.positions['n1']).toEqual({ x: 10, y: 20 });
    expect(after.rev).toBe(before + 1);
  });

  it('removeNode also removes connected edges', () => {
    const s = useGraphStore.getState();
    s.addNode({ id: 'a', kind: 'mesh', primitive: 'cube' });
    s.addNode(makeShader('b'));
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

  it('updateShaderSource patches vertex/fragment sources', () => {
    useGraphStore.getState().addNode(makeShader('s1', 'A'));
    useGraphStore.getState().updateShaderSource('s1', { fragmentSource: 'B' });
    const node = useGraphStore.getState().nodes[0] as ShaderGraphNode;
    expect(node.fragmentSource).toBe('B');
  });

  it('setUniformValue bumps uniformRev not rev', () => {
    useGraphStore.getState().addNode(makeShader('s1'));
    const before = useGraphStore.getState();
    useGraphStore.getState().setUniformValue('s1', 'u_intensity', 0.5);
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ShaderGraphNode).uniformValues.u_intensity).toBe(0.5);
    expect(after.uniformRev).toBe(before.uniformRev + 1);
    expect(after.rev).toBe(before.rev);
  });

  it('removeEdge removes only the named edge', () => {
    const s = useGraphStore.getState();
    s.addEdge({ id: 'e1', source: 'a', sourceHandle: 'o', target: 'b', targetHandle: 'i' });
    s.addEdge({ id: 'e2', source: 'a', sourceHandle: 'o', target: 'c', targetHandle: 'i' });
    useGraphStore.getState().removeEdge('e1');
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e2']);
  });
});

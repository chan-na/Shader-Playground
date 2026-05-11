import { describe, expect, it } from 'vitest';
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  DEMO_LAYOUT,
} from './demoGraph';
import { topologicalOrder, validateGraph } from '../core/graph/validate';
import { NODE_META } from '../core/nodes/registry';
import type { ShaderGraphNode } from '../core/graph/types';

describe('createDemoGraph (single shader)', () => {
  it('produces a valid graph', () => {
    expect(validateGraph(createDemoGraph())).toEqual([]);
  });
  it('has a layout entry for every node', () => {
    for (const n of createDemoGraph().nodes) {
      expect(DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

describe('createChainDemoGraph (noise → blur → tonemap → output)', () => {
  const graph = createChainDemoGraph();

  it('passes validation (no cycles, no multi-input, single output)', () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it('orders shader passes so each samples its predecessor', () => {
    const order = topologicalOrder(graph).map((n) => n.id);
    expect(order.indexOf('noise1')).toBeLessThan(order.indexOf('blur1'));
    expect(order.indexOf('blur1')).toBeLessThan(order.indexOf('tonemap1'));
    expect(order.indexOf('tonemap1')).toBeLessThan(order.indexOf('output1'));
  });

  it('exposes blur/tonemap sampler uniforms as texture input ports', () => {
    const meta = NODE_META.shader;
    for (const id of ['blur1', 'tonemap1']) {
      const node = graph.nodes.find((n) => n.id === id) as ShaderGraphNode;
      const ports = meta.inputs(node);
      expect(ports.find((p) => p.name === 'u_tex' && p.type === 'texture')).toBeDefined();
    }
  });

  it('noise pass has no sampler input port (it is the chain head)', () => {
    const meta = NODE_META.shader;
    const node = graph.nodes.find((n) => n.id === 'noise1') as ShaderGraphNode;
    const ports = meta.inputs(node);
    expect(ports.find((p) => p.type === 'texture')).toBeUndefined();
  });

  it('chain edges route ShaderNode → ShaderNode through sampler handles', () => {
    const samplerEdges = graph.edges.filter((e) => e.targetHandle === 'u_tex');
    expect(samplerEdges).toHaveLength(2);
    expect(samplerEdges.every((e) => e.sourceHandle === 'texture')).toBe(true);
  });

  it('has a layout entry for every node', () => {
    for (const n of graph.nodes) {
      expect(CHAIN_DEMO_LAYOUT[n.id]).toBeDefined();
    }
  });
});

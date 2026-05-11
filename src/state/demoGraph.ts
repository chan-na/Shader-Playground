import basicVert from '../shaders/basic.vert?raw';
import unlitFrag from '../shaders/templates/unlit.frag?raw';
import type { Graph } from '../core/graph/types';

export function createDemoGraph(): Graph {
  return {
    nodes: [
      { id: 'mesh1', kind: 'mesh', primitive: 'sphere' },
      {
        id: 'shader1',
        kind: 'shader',
        vertexSource: basicVert,
        fragmentSource: unlitFrag,
        uniformValues: {
          u_baseColor: [0.3, 0.7, 1.0],
        },
      },
      { id: 'output1', kind: 'output' },
    ],
    edges: [
      {
        id: 'e1',
        source: 'mesh1',
        sourceHandle: 'mesh',
        target: 'shader1',
        targetHandle: 'mesh',
      },
      {
        id: 'e2',
        source: 'shader1',
        sourceHandle: 'texture',
        target: 'output1',
        targetHandle: 'texture',
      },
    ],
  };
}

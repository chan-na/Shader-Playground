import type { GraphNodeKind, PortType } from '../graph/types';
import { parseUniforms, samplerUniforms } from '../graph/uniformParser';
import type { ShaderGraphNode } from '../graph/types';

export interface PortSpec {
  name: string;
  type: PortType;
}

export interface NodeKindMeta {
  kind: GraphNodeKind;
  label: string;
  inputs: (node: ShaderGraphNode | null) => PortSpec[];
  outputs: () => PortSpec[];
}

export const NODE_META: Record<GraphNodeKind, NodeKindMeta> = {
  mesh: {
    kind: 'mesh',
    label: 'Mesh',
    inputs: () => [],
    outputs: () => [{ name: 'mesh', type: 'mesh' }],
  },
  image: {
    kind: 'image',
    label: 'Image',
    inputs: () => [],
    outputs: () => [{ name: 'texture', type: 'texture' }],
  },
  shader: {
    kind: 'shader',
    label: 'Shader',
    inputs: (sn) => {
      const ports: PortSpec[] = [{ name: 'mesh', type: 'mesh' }];
      if (sn) {
        const specs = parseUniforms(`${sn.vertexSource}\n${sn.fragmentSource}`);
        for (const s of samplerUniforms(specs)) {
          ports.push({ name: s.name, type: 'texture' });
        }
      }
      return ports;
    },
    outputs: () => [{ name: 'texture', type: 'texture' }],
  },
  output: {
    kind: 'output',
    label: 'Output',
    inputs: () => [{ name: 'texture', type: 'texture' }],
    outputs: () => [],
  },
};

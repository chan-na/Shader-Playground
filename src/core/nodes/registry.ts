import type { GraphNodeKind, ParamKind, PortType } from '../graph/types';
import { inspectorUniforms, parseUniforms, samplerUniforms } from '../graph/uniformParser';
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

/** Map a GLSL uniform type to the corresponding edge port type. */
export function uniformTypeToPort(type: string): PortType | null {
  switch (type) {
    case 'float':
      return 'float';
    case 'vec2':
      return 'vec2';
    case 'vec3':
      return 'vec3';
    case 'vec4':
      return 'vec4';
    default:
      return null;
  }
}

export function paramOutputPort(paramKind: ParamKind): PortSpec {
  switch (paramKind) {
    case 'float':
    case 'time':
      return { name: 'value', type: 'float' };
    case 'vec3':
    case 'color':
      return { name: 'value', type: 'vec3' };
  }
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
        for (const s of inspectorUniforms(specs)) {
          const t = uniformTypeToPort(s.type);
          if (t) ports.push({ name: s.name, type: t });
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
  param: {
    kind: 'param',
    label: 'Parameter',
    inputs: () => [],
    // The actual output type depends on the param kind. Callers that need
    // per-instance accuracy should use paramOutputPort(node.paramKind).
    outputs: () => [{ name: 'value', type: 'float' }],
  },
};

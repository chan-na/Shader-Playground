import { describe, expect, it } from 'vitest';
import { NODE_META } from './registry';
import type { ShaderGraphNode } from '../graph/types';

describe('NODE_META', () => {
  it('mesh has one mesh output, no inputs', () => {
    expect(NODE_META.mesh.inputs(null)).toEqual([]);
    expect(NODE_META.mesh.outputs()).toEqual([{ name: 'mesh', type: 'mesh' }]);
  });

  it('image has one texture output', () => {
    expect(NODE_META.image.outputs()).toEqual([{ name: 'texture', type: 'texture' }]);
  });

  it('output has one texture input, no outputs', () => {
    expect(NODE_META.output.inputs(null)).toEqual([{ name: 'texture', type: 'texture' }]);
    expect(NODE_META.output.outputs()).toEqual([]);
  });

  it('shader inputs: mesh always, plus sampler2D uniforms as texture ports', () => {
    const sn: ShaderGraphNode = {
      id: 's',
      kind: 'shader',
      vertexSource: '',
      fragmentSource: `
        uniform sampler2D u_tex;
        uniform sampler2D u_normal;
        uniform float u_intensity;
      `,
      uniformValues: {},
    };
    const inputs = NODE_META.shader.inputs(sn).map((p) => p.name);
    expect(inputs).toEqual(['mesh', 'u_tex', 'u_normal']);
  });

  it('shader without samplers: only mesh input', () => {
    const sn: ShaderGraphNode = {
      id: 's',
      kind: 'shader',
      vertexSource: '',
      fragmentSource: 'uniform float u_x;',
      uniformValues: {},
    };
    expect(NODE_META.shader.inputs(sn).map((p) => p.name)).toEqual(['mesh']);
  });
});

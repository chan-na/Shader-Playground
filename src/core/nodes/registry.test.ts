import { describe, expect, it } from 'vitest';
import { NODE_META, paramOutputPort, uniformTypeToPort } from './registry';
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

  it('shader inputs: mesh always, plus sampler2D uniforms as texture ports + scalar uniforms', () => {
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
    const inputs = NODE_META.shader.inputs(sn);
    expect(inputs.map((p) => p.name)).toEqual(['mesh', 'u_tex', 'u_normal', 'u_intensity']);
    expect(inputs.find((p) => p.name === 'u_intensity')?.type).toBe('float');
    expect(inputs.find((p) => p.name === 'u_tex')?.type).toBe('texture');
  });

  it('shader exposes vec3 uniforms as vec3 ports', () => {
    const sn: ShaderGraphNode = {
      id: 's',
      kind: 'shader',
      vertexSource: '',
      fragmentSource: `
        uniform vec3 u_tint;
        uniform vec3 u_baseColor;
      `,
      uniformValues: {},
    };
    const inputs = NODE_META.shader.inputs(sn);
    expect(inputs.find((p) => p.name === 'u_tint')?.type).toBe('vec3');
    expect(inputs.find((p) => p.name === 'u_baseColor')?.type).toBe('vec3');
  });

  it('shader with a float uniform exposes mesh + that uniform port', () => {
    const sn: ShaderGraphNode = {
      id: 's',
      kind: 'shader',
      vertexSource: '',
      fragmentSource: 'uniform float u_x;',
      uniformValues: {},
    };
    expect(NODE_META.shader.inputs(sn).map((p) => p.name)).toEqual(['mesh', 'u_x']);
  });

  it('shader skips system uniforms and mat4 uniforms', () => {
    const sn: ShaderGraphNode = {
      id: 's',
      kind: 'shader',
      vertexSource: '',
      fragmentSource: `
        uniform float u_time;
        uniform mat4 u_view;
        uniform vec3 u_baseColor;
      `,
      uniformValues: {},
    };
    const names = NODE_META.shader.inputs(sn).map((p) => p.name);
    expect(names).toContain('u_baseColor');
    expect(names).not.toContain('u_time');
    expect(names).not.toContain('u_view');
  });
});

describe('paramOutputPort', () => {
  it('float/time → float', () => {
    expect(paramOutputPort('float').type).toBe('float');
    expect(paramOutputPort('time').type).toBe('float');
  });

  it('vec3/color → vec3', () => {
    expect(paramOutputPort('vec3').type).toBe('vec3');
    expect(paramOutputPort('color').type).toBe('vec3');
  });
});

describe('uniformTypeToPort', () => {
  it('maps standard scalar/vector types', () => {
    expect(uniformTypeToPort('float')).toBe('float');
    expect(uniformTypeToPort('vec2')).toBe('vec2');
    expect(uniformTypeToPort('vec3')).toBe('vec3');
    expect(uniformTypeToPort('vec4')).toBe('vec4');
  });

  it('returns null for unsupported types (matrices, samplers, ints)', () => {
    expect(uniformTypeToPort('mat4')).toBeNull();
    expect(uniformTypeToPort('sampler2D')).toBeNull();
    expect(uniformTypeToPort('int')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseUniforms,
  inspectorUniforms,
  samplerUniforms,
  SYSTEM_UNIFORMS,
} from './uniformParser';

describe('parseUniforms', () => {
  it('parses basic float and vec uniforms', () => {
    const src = `
      uniform float u_intensity;
      uniform vec3 u_baseColor;
      uniform vec2 u_offset;
      void main() {}
    `;
    const u = parseUniforms(src);
    expect(u.map((x) => x.name).sort()).toEqual(['u_baseColor', 'u_intensity', 'u_offset']);
    const intensity = u.find((x) => x.name === 'u_intensity')!;
    expect(intensity.type).toBe('float');
    expect(intensity.control).toBe('slider');
    expect(intensity.system).toBe(false);
  });

  it('detects color names → color picker', () => {
    const src = `
      uniform vec3 u_baseColor;
      uniform vec4 u_tintColor;
      uniform vec3 u_position;
    `;
    const u = parseUniforms(src);
    expect(u.find((x) => x.name === 'u_baseColor')!.control).toBe('color');
    expect(u.find((x) => x.name === 'u_tintColor')!.control).toBe('color');
    expect(u.find((x) => x.name === 'u_position')!.control).toBe('multi');
  });

  it('flags system uniforms', () => {
    const src = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform mat4 u_view;
      uniform float u_intensity;
    `;
    const u = parseUniforms(src);
    expect(u.find((x) => x.name === 'u_time')!.system).toBe(true);
    expect(u.find((x) => x.name === 'u_resolution')!.system).toBe(true);
    expect(u.find((x) => x.name === 'u_view')!.system).toBe(true);
    expect(u.find((x) => x.name === 'u_intensity')!.system).toBe(false);
  });

  it('handles precision qualifiers', () => {
    const src = `
      uniform highp float u_x;
      uniform mediump vec2 u_y;
      uniform lowp sampler2D u_tex;
    `;
    const u = parseUniforms(src);
    expect(u).toHaveLength(3);
    expect(u.find((x) => x.name === 'u_tex')!.control).toBe('sampler');
  });

  it('ignores commented-out uniforms', () => {
    const src = `
      // uniform float u_dead;
      /* uniform vec3 u_alsoDead; */
      uniform float u_alive;
    `;
    const u = parseUniforms(src);
    expect(u.map((x) => x.name)).toEqual(['u_alive']);
  });

  it('does not duplicate uniforms', () => {
    const src = `
      uniform float u_x;
      uniform float u_x;
    `;
    const u = parseUniforms(src);
    expect(u).toHaveLength(1);
  });

  it('inspectorUniforms hides system + samplers + matrices', () => {
    const src = `
      uniform float u_time;
      uniform mat4 u_view;
      uniform sampler2D u_tex;
      uniform float u_intensity;
    `;
    const u = parseUniforms(src);
    const visible = inspectorUniforms(u).map((x) => x.name);
    expect(visible).toEqual(['u_intensity']);
  });

  it('samplerUniforms returns only sampler types', () => {
    const src = `
      uniform sampler2D u_tex;
      uniform sampler2D u_normal;
      uniform float u_x;
    `;
    expect(samplerUniforms(parseUniforms(src)).map((x) => x.name)).toEqual([
      'u_tex',
      'u_normal',
    ]);
  });

  it('SYSTEM_UNIFORMS includes the canonical names', () => {
    expect(SYSTEM_UNIFORMS.has('u_time')).toBe(true);
    expect(SYSTEM_UNIFORMS.has('u_resolution')).toBe(true);
    expect(SYSTEM_UNIFORMS.has('u_model')).toBe(true);
  });
});

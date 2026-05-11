import { describe, expect, it } from 'vitest';
import {
  makeCube,
  makePlane,
  makeQuad,
  makeSphere,
  makeTorus,
  makePrimitive,
  PRIMITIVE_NAMES,
} from './primitives';

describe('primitives', () => {
  it('cube has 36 vertices (6 faces × 2 tris × 3)', () => {
    const m = makeCube();
    expect(m.vertexCount).toBe(36);
    const pos = m.attributes.find((a) => a.name === 'a_position')!;
    expect(pos.data.length).toBe(36 * 3);
  });

  it('quad and plane both yield 6 vertices', () => {
    expect(makeQuad().vertexCount).toBe(6);
    expect(makePlane().vertexCount).toBe(6);
  });

  it('sphere produces indexed geometry with normalized normals', () => {
    const m = makeSphere(1, 8, 6);
    expect(m.indices).toBeInstanceOf(Uint16Array);
    const normals = m.attributes.find((a) => a.name === 'a_normal')!;
    for (let i = 0; i < normals.data.length; i += 3) {
      const x = normals.data[i];
      const y = normals.data[i + 1];
      const z = normals.data[i + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(Math.abs(len - 1)).toBeLessThan(1e-3);
    }
  });

  it('torus produces indexed geometry', () => {
    const m = makeTorus();
    expect(m.indices).toBeDefined();
    expect(m.indices!.length % 3).toBe(0);
  });

  it('makePrimitive dispatches to the right builder', () => {
    for (const name of PRIMITIVE_NAMES) {
      const m = makePrimitive(name);
      expect(m.vertexCount).toBeGreaterThan(0);
    }
  });
});

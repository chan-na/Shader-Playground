import { describe, expect, it } from "vitest";
import { generateSeed } from "./computeSeed";

describe("generateSeed", () => {
  it("zero produces all zeros", () => {
    const buf = generateSeed("zero", 8, 3);
    expect(buf.length).toBe(24);
    expect(Array.from(buf).every((x) => x === 0)).toBe(true);
  });

  it("cube produces values in [-1, 1]", () => {
    const buf = generateSeed("cube", 64, 4);
    expect(buf.length).toBe(256);
    for (const v of buf) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("random produces values in [-1, 1]", () => {
    const buf = generateSeed("random", 32, 2);
    for (const v of buf) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("sphere with size 3 keeps every point within unit radius", () => {
    const buf = generateSeed("sphere", 128, 3);
    for (let i = 0; i < buf.length; i += 3) {
      const x = buf[i]!;
      const y = buf[i + 1]!;
      const z = buf[i + 2]!;
      expect(x * x + y * y + z * z).toBeLessThanOrEqual(1);
    }
  });

  it("deterministic: same args yield identical buffers", () => {
    const a = generateSeed("random", 16, 3);
    const b = generateSeed("random", 16, 3);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("different sizes/counts produce different buffers", () => {
    const a = generateSeed("random", 16, 3);
    const b = generateSeed("random", 32, 3);
    expect(a.length).not.toBe(b.length);
  });
});

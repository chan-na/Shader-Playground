import { describe, expect, it } from "vitest";
import { snapshotUniformValue, uniformValuesEqual } from "./uniformCache";

describe("uniformValuesEqual", () => {
  it("matches identical numbers", () => {
    expect(uniformValuesEqual(0, 0)).toBe(true);
    expect(uniformValuesEqual(1.5, 1.5)).toBe(true);
    expect(uniformValuesEqual(-0, 0)).toBe(true);
  });

  it("rejects different numbers", () => {
    expect(uniformValuesEqual(0.1, 0.2)).toBe(false);
    expect(uniformValuesEqual(1, 1.0001)).toBe(false);
  });

  it("treats NaN as unequal (matches `===` semantics)", () => {
    expect(uniformValuesEqual(NaN, NaN)).toBe(false);
  });

  it("matches identical arrays element-wise", () => {
    expect(uniformValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(uniformValuesEqual([0.5, 0.5], [0.5, 0.5])).toBe(true);
  });

  it("rejects arrays differing in length", () => {
    expect(uniformValuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(uniformValuesEqual([1, 2, 3], [1, 2])).toBe(false);
  });

  it("rejects arrays differing in any element", () => {
    expect(uniformValuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("returns false when comparing scalar vs array", () => {
    expect(uniformValuesEqual(1, [1])).toBe(false);
    expect(uniformValuesEqual([1], 1)).toBe(false);
  });

  it("returns false when previous value is undefined (first frame)", () => {
    expect(uniformValuesEqual(undefined, 0)).toBe(false);
    expect(uniformValuesEqual(undefined, [0, 0, 0])).toBe(false);
  });
});

describe("snapshotUniformValue", () => {
  it("returns numbers unchanged", () => {
    expect(snapshotUniformValue(0.5)).toBe(0.5);
  });

  it("returns a detached array copy", () => {
    const src = [1, 2, 3];
    const snap = snapshotUniformValue(src);
    expect(snap).toEqual(src);
    expect(snap).not.toBe(src);

    // Mutating src must not affect snapshot.
    src[0] = 999;
    expect((snap as number[])[0]).toBe(1);
  });
});

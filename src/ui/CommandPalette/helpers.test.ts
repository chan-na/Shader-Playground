import { describe, expect, it } from "vitest";
import { fuzzyMatch, nextActive, prevActive, rankCommands } from "./helpers";

describe("fuzzyMatch", () => {
  it("returns 1 for empty query (no filtering)", () => {
    expect(fuzzyMatch("Anything", "")).toBe(1);
  });

  it("scores a substring match higher when found earlier", () => {
    const early = fuzzyMatch("noise frag", "noise");
    const late = fuzzyMatch("add noise", "noise");
    expect(early).toBeGreaterThan(late);
    // 100 - index pattern: position 0 → 100, position 4 → 96
    expect(early).toBe(100);
    expect(late).toBe(96);
  });

  it("is case-insensitive on both haystack and query", () => {
    expect(fuzzyMatch("NOISE", "noise")).toBe(100);
    expect(fuzzyMatch("noise", "NOISE")).toBe(100);
  });

  it("falls back to subsequence scoring when no substring", () => {
    // 'nbl' is a subsequence of 'noise blur' (n, b, l) but not a substring
    const score = fuzzyMatch("noise blur", "nbl");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
    expect(score).toBe(3);
  });

  it("returns 0 when no subsequence match exists", () => {
    expect(fuzzyMatch("abc", "xyz")).toBe(0);
  });

  it("returns 0 when query has unmatched trailing chars", () => {
    // 'add' has only 'a' matching in 'abc' as subsequence stop
    expect(fuzzyMatch("abc", "abz")).toBe(0);
  });
});

describe("rankCommands", () => {
  const cmds = [
    { id: "1", label: "Add Mesh: cube", keywords: "mesh primitive cube" },
    { id: "2", label: "Add Mesh: sphere", keywords: "mesh primitive sphere" },
    { id: "3", label: "Add Shader: Noise", keywords: "shader noise fragment" },
    { id: "4", label: "Clear graph", keywords: "clear reset empty" },
  ] as const;

  it("returns all commands as a fresh array for empty query", () => {
    const out = rankCommands(cmds, "");
    expect(out).toHaveLength(4);
    expect(out).not.toBe(cmds); // copy, not same reference
    expect(out[0]).toBe(cmds[0]);
  });

  it("filters non-matches and sorts by score descending", () => {
    const out = rankCommands(cmds, "noise");
    expect(out.map((c) => c.id)).toEqual(["3"]);
  });

  it("ranks earlier substring hits before later ones", () => {
    const out = rankCommands(cmds, "mesh");
    // Both '1' and '2' have 'mesh' — keywords/labels position differs but
    // both score the same first-substring-occurrence in concatenation.
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.id).sort()).toEqual(["1", "2"]);
  });

  it("returns empty array when no command matches", () => {
    expect(rankCommands(cmds, "zzzzz")).toEqual([]);
  });
});

describe("nextActive / prevActive", () => {
  it("nextActive advances by 1 but never past last index", () => {
    expect(nextActive(0, 5)).toBe(1);
    expect(nextActive(3, 5)).toBe(4);
    expect(nextActive(4, 5)).toBe(4); // already at last
  });

  it("nextActive returns 0 for an empty list", () => {
    expect(nextActive(0, 0)).toBe(0);
  });

  it("prevActive decrements by 1 but never below 0", () => {
    expect(prevActive(5)).toBe(4);
    expect(prevActive(1)).toBe(0);
    expect(prevActive(0)).toBe(0);
  });
});

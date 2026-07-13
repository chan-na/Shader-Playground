import { describe, expect, it } from "vitest";
import {
  cycleModePrefix,
  fuzzyMatch,
  fuzzySegments,
  groupCommands,
  nextActive,
  parseMode,
  prevActive,
  rankCommands,
} from "./helpers";

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

describe("parseMode", () => {
  it("returns mode 'all' with the raw query when there is no prefix", () => {
    expect(parseMode("torus")).toEqual({ mode: "all", term: "torus" });
  });

  it("returns mode 'all' with an empty term for an empty query", () => {
    expect(parseMode("")).toEqual({ mode: "all", term: "" });
  });

  it("parses '@' as node mode and strips the prefix", () => {
    expect(parseMode("@torus")).toEqual({ mode: "node", term: "torus" });
  });

  it("parses '>' as command mode and strips the prefix", () => {
    expect(parseMode(">clear")).toEqual({ mode: "command", term: "clear" });
  });

  it("parses '/' as preset mode and strips the prefix", () => {
    expect(parseMode("/sphere")).toEqual({ mode: "preset", term: "sphere" });
  });

  it("returns an empty term for a prefix-only query", () => {
    expect(parseMode("@")).toEqual({ mode: "node", term: "" });
    expect(parseMode(">")).toEqual({ mode: "command", term: "" });
    expect(parseMode("/")).toEqual({ mode: "preset", term: "" });
  });
});

describe("fuzzySegments", () => {
  it("marks a leading match as a single hit segment", () => {
    expect(fuzzySegments("Torus", "tor")).toEqual([
      { text: "Tor", hit: true },
      { text: "us", hit: false },
    ]);
  });

  it("splits into alternating hit/non-hit runs for a scattered match", () => {
    expect(fuzzySegments("Add Mesh: cube", "amc")).toEqual([
      { text: "A", hit: true },
      { text: "dd ", hit: false },
      { text: "M", hit: true },
      { text: "esh: ", hit: false },
      { text: "c", hit: true },
      { text: "ube", hit: false },
    ]);
  });

  it("is case-insensitive when matching but preserves the label's casing", () => {
    expect(fuzzySegments("SHADER", "sha")).toEqual([
      { text: "SHA", hit: true },
      { text: "DER", hit: false },
    ]);
  });

  it("returns a single non-hit segment when the term does not match", () => {
    expect(fuzzySegments("Torus", "xyz")).toEqual([
      { text: "Torus", hit: false },
    ]);
  });

  it("returns a single non-hit segment for an empty term", () => {
    expect(fuzzySegments("Torus", "")).toEqual([{ text: "Torus", hit: false }]);
  });
});

describe("cycleModePrefix", () => {
  it("cycles '' → '@' → '>' → '/' → '' while preserving the term", () => {
    expect(cycleModePrefix("torus")).toBe("@torus");
    expect(cycleModePrefix("@torus")).toBe(">torus");
    expect(cycleModePrefix(">torus")).toBe("/torus");
    expect(cycleModePrefix("/torus")).toBe("torus");
  });

  it("cycles a prefix-only query without inventing a term", () => {
    expect(cycleModePrefix("")).toBe("@");
    expect(cycleModePrefix("@")).toBe(">");
    expect(cycleModePrefix(">")).toBe("/");
    expect(cycleModePrefix("/")).toBe("");
  });
});

describe("groupCommands", () => {
  const items = [
    { id: "n1", kind: "node" as const },
    { id: "c1", kind: "command" as const },
    { id: "p1", kind: "preset" as const },
    { id: "n2", kind: "node" as const },
  ];

  it("orders groups node → command → preset with matching counts", () => {
    const groups = groupCommands(items);
    expect(groups.map((g) => g.title)).toEqual([
      "Nodes",
      "Commands",
      "Presets",
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1, 1]);
    expect(groups[0]?.items.map((it) => it.id)).toEqual(["n1", "n2"]);
  });

  it("excludes groups that have no matching items", () => {
    const groups = groupCommands(items.filter((it) => it.kind !== "preset"));
    expect(groups.map((g) => g.title)).toEqual(["Nodes", "Commands"]);
  });

  it("returns an empty array when there are no items", () => {
    expect(groupCommands([])).toEqual([]);
  });
});

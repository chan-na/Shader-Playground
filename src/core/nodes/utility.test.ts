import { describe, expect, it } from "vitest";
import type { Graph } from "../graph/types";
import {
  combineInputPorts,
  combineOutputPort,
  mathInputPorts,
  nodeInputPorts,
  nodeOutputPorts,
  swizzleOutputPort,
} from "./registry";
import {
  applySwizzle,
  computeMath,
  isValidSwizzleMask,
  resolveValueFor,
} from "./utility";

describe("computeMath", () => {
  it("binary ops", () => {
    expect(computeMath("add", 2, 3)).toBe(5);
    expect(computeMath("subtract", 5, 2)).toBe(3);
    expect(computeMath("multiply", 4, 3)).toBe(12);
    expect(computeMath("divide", 10, 4)).toBe(2.5);
    expect(computeMath("pow", 2, 8)).toBe(256);
  });
  it("divide-by-zero is 0 (no NaN/Infinity)", () => {
    expect(computeMath("divide", 1, 0)).toBe(0);
  });
  it("unary ops ignore the second arg", () => {
    expect(computeMath("abs", -7, 999)).toBe(7);
    expect(computeMath("sin", 0, 999)).toBe(0);
    expect(computeMath("cos", 0, 999)).toBe(1);
  });
  it("pow clamps NaN/Infinity results to 0 (L10)", () => {
    expect(computeMath("pow", 2, 3)).toBe(8);
    expect(computeMath("pow", -1, 0.5)).toBe(0); // would be NaN
    expect(computeMath("pow", 0, -1)).toBe(0); // would be Infinity
  });
});

describe("isValidSwizzleMask", () => {
  it("accepts single and multi-component masks", () => {
    for (const m of ["x", "y", "z", "w", "xy", "xyz", "xyzw", "wzyx", "xxyy"]) {
      expect(isValidSwizzleMask(m)).toBe(true);
    }
  });
  it("rejects empty, too-long, and unknown chars", () => {
    expect(isValidSwizzleMask("")).toBe(false);
    expect(isValidSwizzleMask("xyzwa")).toBe(false);
    expect(isValidSwizzleMask("rgba")).toBe(false);
  });
});

describe("applySwizzle", () => {
  it("expands a scalar input by broadcasting", () => {
    expect(applySwizzle(3, "xyz")).toEqual([3, 3, 3]);
  });
  it("reorders vector components", () => {
    expect(applySwizzle([1, 2, 3, 4], "wzyx")).toEqual([4, 3, 2, 1]);
  });
  it("repeats components freely", () => {
    expect(applySwizzle([1, 2, 3], "yyy")).toEqual([2, 2, 2]);
  });
  it("returns a scalar for a 1-char mask", () => {
    expect(applySwizzle([1, 2, 3], "z")).toBe(3);
  });
  it("pads short vectors with zeros for higher channels", () => {
    expect(applySwizzle([1, 2], "xyzw")).toEqual([1, 2, 0, 0]);
  });
  it("returns a scalar 0 for empty/invalid masks to match the float port (L10)", () => {
    // swizzleOutputPort is `float` for these, so the value must be a scalar too.
    expect(applySwizzle([1, 2, 3], "")).toBe(0);
    expect(applySwizzle([1, 2, 3], "rgba")).toBe(0);
    expect(applySwizzle([1, 2, 3], "xyzwx")).toBe(0);
  });
});

describe("resolveValueFor", () => {
  const ctx = { time: 1.5 };

  it("returns the param node value directly", () => {
    const graph: Graph = {
      nodes: [{ id: "p", kind: "param", paramKind: "float", value: 0.42 }],
      edges: [],
    };
    expect(resolveValueFor("p", graph, ctx, new Map())).toBe(0.42);
  });

  it("evaluates a time param at the current time", () => {
    const graph: Graph = {
      nodes: [{ id: "t", kind: "param", paramKind: "time", value: [2, 0.5] }],
      edges: [],
    };
    expect(resolveValueFor("t", graph, ctx, new Map())).toBeCloseTo(3.5, 6);
  });

  it("evaluates a math node with no edges using its inline defaults", () => {
    const graph: Graph = {
      nodes: [{ id: "m", kind: "math", op: "add", a: 1, b: 2 }],
      edges: [],
    };
    expect(resolveValueFor("m", graph, ctx, new Map())).toBe(3);
  });

  it("chains math nodes through param edges", () => {
    // (param a=10) -> math.b (op=subtract, a inline=2)  ==>  2 - 10 = -8
    const graph: Graph = {
      nodes: [
        { id: "p", kind: "param", paramKind: "float", value: 10 },
        { id: "m", kind: "math", op: "subtract", a: 2, b: 0 },
      ],
      edges: [
        {
          id: "e",
          source: "p",
          sourceHandle: "value",
          target: "m",
          targetHandle: "b",
        },
      ],
    };
    expect(resolveValueFor("m", graph, ctx, new Map())).toBe(-8);
  });

  it("combine pulls per-channel values from inline + edge mix", () => {
    // x=0.5 inline, y from param 0.8, z=0 inline → vec3(0.5, 0.8, 0)
    const graph: Graph = {
      nodes: [
        { id: "py", kind: "param", paramKind: "float", value: 0.8 },
        { id: "c", kind: "combine", arity: 3, values: [0.5, 0, 0, 0] },
      ],
      edges: [
        {
          id: "e",
          source: "py",
          sourceHandle: "value",
          target: "c",
          targetHandle: "y",
        },
      ],
    };
    expect(resolveValueFor("c", graph, ctx, new Map())).toEqual([0.5, 0.8, 0]);
  });

  it("swizzle pulls from upstream vec and rearranges components", () => {
    const graph: Graph = {
      nodes: [
        { id: "c", kind: "combine", arity: 4, values: [1, 2, 3, 4] },
        { id: "s", kind: "swizzle", mask: "wzyx" },
      ],
      edges: [
        {
          id: "e",
          source: "c",
          sourceHandle: "value",
          target: "s",
          targetHandle: "in",
        },
      ],
    };
    expect(resolveValueFor("s", graph, ctx, new Map())).toEqual([4, 3, 2, 1]);
  });

  it("returns 0 for unknown nodes", () => {
    const graph: Graph = { nodes: [], edges: [] };
    expect(resolveValueFor("missing", graph, ctx, new Map())).toBe(0);
  });

  it("memoises fan-out: a source is resolved once and reused from cache (L39)", () => {
    const graph: Graph = {
      nodes: [
        { id: "p", kind: "param", paramKind: "float", value: 7 },
        { id: "m1", kind: "math", op: "multiply", a: 1, b: 2 },
        { id: "m2", kind: "math", op: "multiply", a: 1, b: 3 },
      ],
      edges: [
        {
          id: "e1",
          source: "p",
          sourceHandle: "value",
          target: "m1",
          targetHandle: "a",
        },
        {
          id: "e2",
          source: "p",
          sourceHandle: "value",
          target: "m2",
          targetHandle: "a",
        },
      ],
    };
    const cache = new Map();
    expect(resolveValueFor("m1", graph, ctx, cache)).toBe(14); // 7 * 2
    // Poison the cache: a second resolve that RE-evaluated `p` would read 7
    // again → 21. Reusing the memoised entry reads 100 → 300. The latter proves
    // the fan-out source is not re-evaluated.
    cache.set("p", 100);
    expect(resolveValueFor("m2", graph, ctx, cache)).toBe(300); // 100 * 3
    expect(cache.get("p")).toBe(100);
  });

  it("is cycle-safe: a mutual reference terminates via the zero sentinel (L39)", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", kind: "math", op: "add", a: 1, b: 0 },
        { id: "b", kind: "math", op: "add", a: 1, b: 0 },
      ],
      edges: [
        {
          id: "e1",
          source: "b",
          sourceHandle: "value",
          target: "a",
          targetHandle: "a",
        },
        {
          id: "e2",
          source: "a",
          sourceHandle: "value",
          target: "b",
          targetHandle: "a",
        },
      ],
    };
    // Must not recurse forever — the pre-seeded 0 sentinel breaks the loop.
    expect(resolveValueFor("a", graph, ctx, new Map())).toBe(0);
  });
});

describe("registry helpers for utility nodes", () => {
  it("mathInputPorts surfaces only `a` for unary ops", () => {
    expect(mathInputPorts("abs").map((p) => p.name)).toEqual(["a"]);
    expect(mathInputPorts("sin").map((p) => p.name)).toEqual(["a"]);
    expect(mathInputPorts("cos").map((p) => p.name)).toEqual(["a"]);
  });
  it("mathInputPorts surfaces `a` and `b` for binary ops", () => {
    expect(mathInputPorts("add").map((p) => p.name)).toEqual(["a", "b"]);
    expect(mathInputPorts("pow").map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("swizzleOutputPort tracks mask length", () => {
    expect(swizzleOutputPort("x").type).toBe("float");
    expect(swizzleOutputPort("xy").type).toBe("vec2");
    expect(swizzleOutputPort("xyz").type).toBe("vec3");
    expect(swizzleOutputPort("xyzw").type).toBe("vec4");
  });
  it("swizzleOutputPort falls back to float for an invalid mask", () => {
    expect(swizzleOutputPort("abc").type).toBe("float");
  });

  it("combineInputPorts has exactly `arity` ports", () => {
    expect(combineInputPorts(2).map((p) => p.name)).toEqual(["x", "y"]);
    expect(combineInputPorts(3).map((p) => p.name)).toEqual(["x", "y", "z"]);
    expect(combineInputPorts(4).map((p) => p.name)).toEqual([
      "x",
      "y",
      "z",
      "w",
    ]);
  });
  it("combineOutputPort matches the arity", () => {
    expect(combineOutputPort(2).type).toBe("vec2");
    expect(combineOutputPort(3).type).toBe("vec3");
    expect(combineOutputPort(4).type).toBe("vec4");
  });

  it("nodeInputPorts/nodeOutputPorts route through configuration", () => {
    expect(
      nodeInputPorts({ id: "m", kind: "math", op: "abs", a: 0, b: 0 }).map(
        (p) => p.name,
      ),
    ).toEqual(["a"]);
    expect(
      nodeOutputPorts({ id: "s", kind: "swizzle", mask: "xy" })[0]!.type,
    ).toBe("vec2");
    expect(
      nodeOutputPorts({
        id: "c",
        kind: "combine",
        arity: 4,
        values: [0, 0, 0, 0],
      })[0]!.type,
    ).toBe("vec4");
  });
});

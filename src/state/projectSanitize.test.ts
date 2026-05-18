import { describe, expect, it } from "vitest";
import {
  SANITIZE_LIMITS,
  sanitizeGraphEdge,
  sanitizeGraphNode,
} from "./projectSanitize";

describe("sanitizeGraphNode — base shape", () => {
  it("rejects non-object payloads", () => {
    const r = sanitizeGraphNode(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/object/);
  });

  it("rejects arrays (typeof object but not record-shaped)", () => {
    const r = sanitizeGraphNode([]);
    expect(r.ok).toBe(false);
  });

  it("rejects nodes with missing or empty id", () => {
    expect(sanitizeGraphNode({ kind: "output" }).ok).toBe(false);
    expect(sanitizeGraphNode({ id: "", kind: "output" }).ok).toBe(false);
  });

  it("rejects unknown kinds", () => {
    const r = sanitizeGraphNode({ id: "n1", kind: "alien" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown node kind/);
  });
});

describe("sanitizeGraphNode — mesh / image", () => {
  it("falls back to 'cube' for unknown primitives", () => {
    const r = sanitizeGraphNode({
      id: "m1",
      kind: "mesh",
      primitive: "obelisk",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "mesh") {
      expect(r.node.primitive).toBe("cube");
    }
  });

  it("coerces non-string assetId to null on mesh/image", () => {
    const m = sanitizeGraphNode({ id: "m", kind: "mesh", assetId: 42 });
    const i = sanitizeGraphNode({ id: "i", kind: "image", assetId: {} });
    if (m.ok && m.node.kind === "mesh") expect(m.node.assetId).toBeNull();
    if (i.ok && i.node.kind === "image") expect(i.node.assetId).toBeNull();
  });
});

describe("sanitizeGraphNode — webcam", () => {
  it("accepts a webcam node with no deviceId", () => {
    const r = sanitizeGraphNode({ id: "w1", kind: "webcam" });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "webcam") {
      expect("deviceId" in r.node).toBe(false);
    }
  });

  it("preserves a string deviceId", () => {
    const r = sanitizeGraphNode({
      id: "w2",
      kind: "webcam",
      deviceId: "cam-xyz",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "webcam") {
      expect(r.node.deviceId).toBe("cam-xyz");
    }
  });

  it("drops oversized deviceId rather than letting it through", () => {
    const huge = "x".repeat(SANITIZE_LIMITS.MAX_DEVICE_ID_LEN + 1);
    const r = sanitizeGraphNode({
      id: "w3",
      kind: "webcam",
      deviceId: huge,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "webcam") {
      expect("deviceId" in r.node).toBe(false);
    }
  });

  it("drops non-string deviceId rather than coercing", () => {
    const r = sanitizeGraphNode({
      id: "w4",
      kind: "webcam",
      deviceId: 42,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "webcam") {
      expect("deviceId" in r.node).toBe(false);
    }
  });
});

describe("sanitizeGraphNode — video", () => {
  it("accepts a video node with no assetId and defaults play/loop/mute to true", () => {
    const r = sanitizeGraphNode({ id: "v1", kind: "video" });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "video") {
      expect(r.node.assetId).toBeNull();
      expect(r.node.playing).toBe(true);
      expect(r.node.loop).toBe(true);
      expect(r.node.muted).toBe(true);
      expect("currentTime" in r.node).toBe(false);
    }
  });

  it("preserves assetId, playing, loop, muted, and currentTime", () => {
    const r = sanitizeGraphNode({
      id: "v2",
      kind: "video",
      assetId: "abc",
      playing: false,
      loop: false,
      muted: false,
      currentTime: 12.5,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "video") {
      expect(r.node.assetId).toBe("abc");
      expect(r.node.playing).toBe(false);
      expect(r.node.loop).toBe(false);
      expect(r.node.muted).toBe(false);
      expect(r.node.currentTime).toBe(12.5);
    }
  });

  it("clamps a negative currentTime to zero", () => {
    const r = sanitizeGraphNode({
      id: "v3",
      kind: "video",
      currentTime: -3,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "video") {
      expect(r.node.currentTime).toBe(0);
    }
  });

  it("drops non-numeric / non-finite currentTime", () => {
    const r = sanitizeGraphNode({
      id: "v4",
      kind: "video",
      currentTime: "later",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "video") {
      expect("currentTime" in r.node).toBe(false);
    }
  });
});

describe("sanitizeGraphNode — shader", () => {
  it("throws on oversized fragmentSource", () => {
    const big = "x".repeat(SANITIZE_LIMITS.MAX_SHADER_SOURCE_LEN + 1);
    const r = sanitizeGraphNode({
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: big,
      uniformValues: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fragmentSource/);
  });

  it("throws when vertexSource is not a string", () => {
    const r = sanitizeGraphNode({
      id: "s",
      kind: "shader",
      vertexSource: 123,
      fragmentSource: "",
      uniformValues: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/vertexSource/);
  });

  it("scrubs NaN / Infinity / non-numeric uniform values", () => {
    const r = sanitizeGraphNode({
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {
        u_a: Number.NaN,
        u_b: Number.POSITIVE_INFINITY,
        u_c: [1, Number.NaN, 3],
        u_d: "bogus",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "shader") {
      expect(r.node.uniformValues.u_a).toBe(0);
      expect(r.node.uniformValues.u_b).toBe(0);
      expect(r.node.uniformValues.u_c).toEqual([1, 0, 3]);
      expect(r.node.uniformValues.u_d).toBeUndefined();
    }
  });

  it("caps uniform key count and array length", () => {
    const uniformValues: Record<string, number | number[]> = {};
    for (let i = 0; i < SANITIZE_LIMITS.MAX_UNIFORM_KEYS + 10; i++) {
      uniformValues[`u_${i}`] = i;
    }
    uniformValues.u_big = new Array(
      SANITIZE_LIMITS.MAX_UNIFORM_ARRAY_LEN + 5,
    ).fill(1);
    const r = sanitizeGraphNode({
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues,
    });
    if (r.ok && r.node.kind === "shader") {
      expect(Object.keys(r.node.uniformValues).length).toBeLessThanOrEqual(
        SANITIZE_LIMITS.MAX_UNIFORM_KEYS,
      );
    }
  });
});

describe("sanitizeGraphNode — compute", () => {
  it("clamps count to [1, MAX_COMPUTE_COUNT] and truncates to integer", () => {
    const hi = sanitizeGraphNode({
      id: "c",
      kind: "compute",
      vertexSource: "",
      count: Number.MAX_SAFE_INTEGER,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    });
    const lo = sanitizeGraphNode({
      id: "c",
      kind: "compute",
      vertexSource: "",
      count: -5,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    });
    const frac = sanitizeGraphNode({
      id: "c",
      kind: "compute",
      vertexSource: "",
      count: 12.7,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    });
    if (hi.ok && hi.node.kind === "compute") {
      expect(hi.node.count).toBe(SANITIZE_LIMITS.MAX_COMPUTE_COUNT);
    }
    if (lo.ok && lo.node.kind === "compute") expect(lo.node.count).toBe(1);
    if (frac.ok && frac.node.kind === "compute")
      expect(frac.node.count).toBe(12);
  });

  it("drops malformed attributes and falls back to safe enum defaults", () => {
    const r = sanitizeGraphNode({
      id: "c",
      kind: "compute",
      vertexSource: "",
      count: 1024,
      primitive: "QUAD",
      attributes: [
        { inName: "a", outName: "b", size: 3, seed: "sphere" },
        { inName: "", outName: "b", size: 3, seed: "sphere" }, // dropped (empty name)
        { inName: "x", outName: "y", size: 7, seed: "alien" }, // size→1, seed→zero
        "not-an-object",
      ],
      uniformValues: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.node.kind === "compute") {
      expect(r.node.primitive).toBe("POINTS");
      expect(r.node.attributes).toHaveLength(2);
      expect(r.node.attributes[1]?.size).toBe(1);
      expect(r.node.attributes[1]?.seed).toBe("zero");
    }
  });
});

describe("sanitizeGraphNode — param / math / swizzle / combine", () => {
  it("param defaults to float kind on unknown paramKind and scrubs NaN value", () => {
    const r = sanitizeGraphNode({
      id: "p",
      kind: "param",
      paramKind: "ulong",
      value: Number.NaN,
    });
    if (r.ok && r.node.kind === "param") {
      expect(r.node.paramKind).toBe("float");
      expect(r.node.value).toBe(0);
    }
  });

  it("param preserves vec3 array and drops oversized label", () => {
    const r = sanitizeGraphNode({
      id: "p",
      kind: "param",
      paramKind: "vec3",
      value: [1, Number.NaN, 3, 4, 5],
      label: "x".repeat(SANITIZE_LIMITS.MAX_PARAM_LABEL_LEN + 1),
    });
    if (r.ok && r.node.kind === "param") {
      expect(r.node.value).toEqual([1, 0, 3, 4, 5]);
      expect(r.node.label).toBeUndefined();
    }
  });

  it("math defaults to 'add' for unknown op and scrubs NaN operands", () => {
    const r = sanitizeGraphNode({
      id: "m",
      kind: "math",
      op: "xor",
      a: Number.NaN,
      b: Number.POSITIVE_INFINITY,
    });
    if (r.ok && r.node.kind === "math") {
      expect(r.node.op).toBe("add");
      expect(r.node.a).toBe(0);
      expect(r.node.b).toBe(0);
    }
  });

  it("swizzle truncates mask beyond MAX_SWIZZLE_LEN", () => {
    const r = sanitizeGraphNode({
      id: "sw",
      kind: "swizzle",
      mask: "xyzwxyz",
    });
    if (r.ok && r.node.kind === "swizzle") {
      expect(r.node.mask.length).toBe(SANITIZE_LIMITS.MAX_SWIZZLE_LEN);
    }
  });

  it("combine clamps arity to a legal value and scrubs values", () => {
    const r = sanitizeGraphNode({
      id: "cb",
      kind: "combine",
      arity: 9,
      values: [Number.NaN, 1],
    });
    if (r.ok && r.node.kind === "combine") {
      expect(r.node.arity).toBe(4);
      expect(r.node.values).toEqual([0, 1, 0, 0]);
    }
  });
});

describe("sanitizeGraphEdge", () => {
  it("accepts well-formed edges", () => {
    const e = sanitizeGraphEdge({
      id: "e1",
      source: "a",
      sourceHandle: "out",
      target: "b",
      targetHandle: "in",
    });
    expect(e).not.toBeNull();
    expect(e?.id).toBe("e1");
  });

  it("rejects edges with non-string fields", () => {
    expect(
      sanitizeGraphEdge({
        id: 1,
        source: "a",
        sourceHandle: "x",
        target: "b",
        targetHandle: "y",
      }),
    ).toBeNull();
  });

  it("rejects null / array / missing-field payloads", () => {
    expect(sanitizeGraphEdge(null)).toBeNull();
    expect(sanitizeGraphEdge([])).toBeNull();
    expect(sanitizeGraphEdge({ id: "e1" })).toBeNull();
  });
});

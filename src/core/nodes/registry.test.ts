import { describe, expect, it } from "vitest";
import type {
  CombineGraphNode,
  ComputeGraphNode,
  GraphNode,
  MathGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
  SwizzleGraphNode,
} from "../graph/types";
import {
  combineInputPorts,
  combineOutputPort,
  mathInputPorts,
  NODE_META,
  nodeInputPorts,
  nodeOutputPorts,
  paramOutputPort,
  swizzleOutputPort,
  uniformTypeToPort,
} from "./registry";

describe("NODE_META", () => {
  it("mesh has one mesh output, no inputs", () => {
    expect(NODE_META.mesh.inputs(null)).toEqual([]);
    expect(NODE_META.mesh.outputs()).toEqual([{ name: "mesh", type: "mesh" }]);
  });

  it("image has one texture output", () => {
    expect(NODE_META.image.outputs()).toEqual([
      { name: "texture", type: "texture" },
    ]);
  });

  it("output has one texture input, no outputs", () => {
    expect(NODE_META.output.inputs(null)).toEqual([
      { name: "texture", type: "texture" },
    ]);
    expect(NODE_META.output.outputs()).toEqual([]);
  });

  it("shader inputs: mesh always, plus sampler2D uniforms as texture ports + scalar uniforms", () => {
    const sn: ShaderGraphNode = {
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: `
        uniform sampler2D u_tex;
        uniform sampler2D u_normal;
        uniform float u_intensity;
      `,
      uniformValues: {},
    };
    const inputs = NODE_META.shader.inputs(sn);
    expect(inputs.map((p) => p.name)).toEqual([
      "mesh",
      "u_tex",
      "u_normal",
      "u_intensity",
    ]);
    expect(inputs.find((p) => p.name === "u_intensity")?.type).toBe("float");
    expect(inputs.find((p) => p.name === "u_tex")?.type).toBe("texture");
  });

  it("shader exposes vec3 uniforms as vec3 ports", () => {
    const sn: ShaderGraphNode = {
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: `
        uniform vec3 u_tint;
        uniform vec3 u_baseColor;
      `,
      uniformValues: {},
    };
    const inputs = NODE_META.shader.inputs(sn);
    expect(inputs.find((p) => p.name === "u_tint")?.type).toBe("vec3");
    expect(inputs.find((p) => p.name === "u_baseColor")?.type).toBe("vec3");
  });

  it("shader with a float uniform exposes mesh + that uniform port", () => {
    const sn: ShaderGraphNode = {
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "uniform float u_x;",
      uniformValues: {},
    };
    expect(NODE_META.shader.inputs(sn).map((p) => p.name)).toEqual([
      "mesh",
      "u_x",
    ]);
  });

  it("shader skips system uniforms and mat4 uniforms", () => {
    const sn: ShaderGraphNode = {
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: `
        uniform float u_time;
        uniform mat4 u_view;
        uniform vec3 u_baseColor;
      `,
      uniformValues: {},
    };
    const names = NODE_META.shader.inputs(sn).map((p) => p.name);
    expect(names).toContain("u_baseColor");
    expect(names).not.toContain("u_time");
    expect(names).not.toContain("u_view");
  });
});

describe("NODE_META.compute (Phase 13)", () => {
  const makeNode = (vertexSource = ""): ComputeGraphNode => ({
    id: "c1",
    kind: "compute",
    vertexSource,
    count: 64,
    primitive: "POINTS",
    attributes: [
      { inName: "a_position", outName: "v_position", size: 3, seed: "sphere" },
    ],
    uniformValues: {},
  });

  it("has a single mesh output and no static inputs", () => {
    const cn = makeNode();
    expect(NODE_META.compute.outputs()).toEqual([
      { name: "mesh", type: "mesh" },
    ]);
    expect(NODE_META.compute.inputs(cn)).toEqual([]);
  });

  it("exposes non-sampler uniforms from the vertex source as input ports", () => {
    const cn = makeNode(`
      uniform float u_dt;
      uniform vec3 u_force;
      uniform sampler2D u_lut;
      uniform float u_time;
    `);
    const ports = NODE_META.compute.inputs(cn).map((p) => p.name);
    expect(ports).toContain("u_dt");
    expect(ports).toContain("u_force");
    expect(ports).not.toContain("u_time"); // system uniform
    expect(ports).not.toContain("u_lut"); // sampler — compute forbids
  });

  it("nodeInputPorts / nodeOutputPorts route through compute meta", () => {
    const cn = makeNode("uniform float u_x;");
    expect(nodeInputPorts(cn).map((p) => p.name)).toEqual(["u_x"]);
    expect(nodeOutputPorts(cn)).toEqual([{ name: "mesh", type: "mesh" }]);
  });
});

describe("paramOutputPort", () => {
  it("float/time → float", () => {
    expect(paramOutputPort("float").type).toBe("float");
    expect(paramOutputPort("time").type).toBe("float");
  });

  it("vec3/color → vec3", () => {
    expect(paramOutputPort("vec3").type).toBe("vec3");
    expect(paramOutputPort("color").type).toBe("vec3");
  });
});

describe("uniformTypeToPort", () => {
  it("maps standard scalar/vector types", () => {
    expect(uniformTypeToPort("float")).toBe("float");
    expect(uniformTypeToPort("vec2")).toBe("vec2");
    expect(uniformTypeToPort("vec3")).toBe("vec3");
    expect(uniformTypeToPort("vec4")).toBe("vec4");
  });

  it("returns null for unsupported types (matrices, samplers, ints)", () => {
    expect(uniformTypeToPort("mat4")).toBeNull();
    expect(uniformTypeToPort("sampler2D")).toBeNull();
    expect(uniformTypeToPort("int")).toBeNull();
  });
});

describe("mathInputPorts", () => {
  it("unary op surfaces only (a)", () => {
    expect(mathInputPorts("sin")).toEqual([{ name: "a", type: "float" }]);
  });

  it("binary op surfaces (a, b)", () => {
    expect(mathInputPorts("add")).toEqual([
      { name: "a", type: "float" },
      { name: "b", type: "float" },
    ]);
  });
});

describe("swizzleOutputPort", () => {
  it("invalid mask falls back to float", () => {
    expect(swizzleOutputPort("xq")).toEqual({ name: "value", type: "float" });
  });

  it("size-1 mask → float", () => {
    expect(swizzleOutputPort("x")).toEqual({ name: "value", type: "float" });
  });

  it("size-2 mask → vec2", () => {
    expect(swizzleOutputPort("xy")).toEqual({ name: "value", type: "vec2" });
  });

  it("size-3 mask → vec3", () => {
    expect(swizzleOutputPort("xyz")).toEqual({ name: "value", type: "vec3" });
  });

  it("size-4 mask → vec4", () => {
    expect(swizzleOutputPort("xyzw")).toEqual({ name: "value", type: "vec4" });
  });
});

describe("combineInputPorts / combineOutputPort", () => {
  it("arity 2 → x/y inputs, vec2 output", () => {
    expect(combineInputPorts(2).map((p) => p.name)).toEqual(["x", "y"]);
    expect(combineOutputPort(2).type).toBe("vec2");
  });

  it("arity 3 → x/y/z inputs, vec3 output", () => {
    expect(combineInputPorts(3).map((p) => p.name)).toEqual(["x", "y", "z"]);
    expect(combineOutputPort(3).type).toBe("vec3");
  });

  it("arity 4 → x/y/z/w inputs, vec4 output", () => {
    expect(combineInputPorts(4).map((p) => p.name)).toEqual([
      "x",
      "y",
      "z",
      "w",
    ]);
    expect(combineOutputPort(4).type).toBe("vec4");
  });
});

describe("nodeInputPorts (per-instance)", () => {
  it("math node routes through mathInputPorts based on op", () => {
    const node: MathGraphNode = {
      id: "m",
      kind: "math",
      op: "sin",
      a: 0,
      b: 0,
    };
    expect(nodeInputPorts(node).map((p) => p.name)).toEqual(["a"]);
  });

  it("combine node routes through combineInputPorts based on arity", () => {
    const node: CombineGraphNode = {
      id: "c",
      kind: "combine",
      arity: 3,
      values: [0, 0, 0, 0],
    };
    expect(nodeInputPorts(node).map((p) => p.name)).toEqual(["x", "y", "z"]);
  });

  it("shader node routes through NODE_META.shader.inputs", () => {
    const sn: ShaderGraphNode = {
      id: "s",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "uniform float u_y;",
      uniformValues: {},
    };
    expect(nodeInputPorts(sn).map((p) => p.name)).toEqual(["mesh", "u_y"]);
  });

  it("kinds without instance-dependent ports fall through to the static meta", () => {
    const meshNode: GraphNode = {
      id: "mesh",
      kind: "mesh",
      primitive: "cube",
    };
    expect(nodeInputPorts(meshNode)).toEqual([]);

    const outputNode: GraphNode = { id: "o", kind: "output" };
    expect(nodeInputPorts(outputNode)).toEqual([
      { name: "texture", type: "texture" },
    ]);
  });
});

describe("nodeOutputPorts (per-instance)", () => {
  it("param node routes through paramOutputPort", () => {
    const node: ParamGraphNode = {
      id: "p",
      kind: "param",
      paramKind: "color",
      value: [1, 0, 0],
    };
    expect(nodeOutputPorts(node)).toEqual([{ name: "value", type: "vec3" }]);
  });

  it("swizzle node routes through swizzleOutputPort", () => {
    const node: SwizzleGraphNode = {
      id: "z",
      kind: "swizzle",
      mask: "xy",
    };
    expect(nodeOutputPorts(node)).toEqual([{ name: "value", type: "vec2" }]);
  });

  it("combine node routes through combineOutputPort", () => {
    const node: CombineGraphNode = {
      id: "c",
      kind: "combine",
      arity: 4,
      values: [0, 0, 0, 0],
    };
    expect(nodeOutputPorts(node)).toEqual([{ name: "value", type: "vec4" }]);
  });

  it("kinds without instance-dependent output fall through to static meta", () => {
    const meshNode: GraphNode = {
      id: "m",
      kind: "mesh",
      primitive: "sphere",
    };
    expect(nodeOutputPorts(meshNode)).toEqual([{ name: "mesh", type: "mesh" }]);
  });
});

import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  CombineGraphNode,
  ComputeGraphNode,
  ImageGraphNode,
  MathGraphNode,
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
  SwizzleGraphNode,
} from "../../../core/graph/types";
import { ComputeNodeView } from "./ComputeNodeView";
import { ImageNodeView } from "./ImageNodeView";
import { MeshNodeView } from "./MeshNodeView";
import { OutputNodeView } from "./OutputNodeView";
import { ParamNodeView } from "./ParamNodeView";
import { ShaderNodeView } from "./ShaderNodeView";
import {
  CombineNodeView,
  MathNodeView,
  SwizzleNodeView,
} from "./UtilityNodeViews";

// NOTE: zustand v5 + useSyncExternalStore returns the *initial* store snapshot
// during `renderToStaticMarkup`, so these tests only assert the static-render
// surface (props-driven cases). Store-dependent branches (asset name in mesh,
// simTime in time param) are covered by their helpers' direct unit tests
// instead — see paramNodeViewHelpers.test.ts.

function mockProps(id: string, node: unknown): NodeProps {
  return { id, data: { node } } as unknown as NodeProps;
}

/** ReactFlow's Handle requires ReactFlowProvider context to mount. */
function renderInFlow(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

describe("MeshNodeView", () => {
  it("renders the primitive label when no asset is bound", () => {
    const node: MeshGraphNode = {
      id: "m1",
      kind: "mesh",
      primitive: "cube",
      assetId: null,
    };
    const html = renderInFlow(<MeshNodeView {...mockProps("m1", node)} />);
    expect(html).toContain("Mesh");
    expect(html).toContain("cube");
    expect(html).toContain("handle-mesh");
  });

  it("includes all primitive options in the select", () => {
    const node: MeshGraphNode = {
      id: "m1",
      kind: "mesh",
      primitive: "sphere",
      assetId: null,
    };
    const html = renderInFlow(<MeshNodeView {...mockProps("m1", node)} />);
    for (const p of ["cube", "sphere", "plane", "torus", "quad"]) {
      expect(html).toContain(`value="${p}"`);
    }
  });
});

describe("ImageNodeView", () => {
  it("renders placeholder when no asset is bound", () => {
    const node: ImageGraphNode = { id: "i1", kind: "image", assetId: null };
    const html = renderInFlow(<ImageNodeView {...mockProps("i1", node)} />);
    expect(html).toContain("Image");
    expect(html).toContain("No image");
    expect(html).toContain("handle-texture");
  });
});

describe("ShaderNodeView", () => {
  it("renders mesh input + texture output handles by default", () => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    };
    const html = renderInFlow(<ShaderNodeView {...mockProps("s1", node)} />);
    expect(html).toContain("Shader");
    expect(html).toContain("handle-mesh");
    expect(html).toContain("handle-texture");
    // Multi-port views render port labels next to handles.
    expect(html).toContain("node-card__port-label--in");
    expect(html).toContain("node-card__port-label--out");
    expect(html).toContain(">mesh<");
    expect(html).toContain(">texture<");
  });

  it("surfaces float uniforms as input handles", () => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "uniform float u_intensity;",
      uniformValues: {},
    };
    const html = renderInFlow(<ShaderNodeView {...mockProps("s1", node)} />);
    expect(html).toContain("handle-float");
    expect(html).toContain(">u_intensity<");
  });

  it("surfaces sampler2D uniforms as texture handles", () => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "uniform sampler2D u_tex;",
      uniformValues: {},
    };
    const html = renderInFlow(<ShaderNodeView {...mockProps("s1", node)} />);
    // mesh handle + sampler handle + output texture handle → at least 2 handle-texture occurrences
    expect((html.match(/handle-texture/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe("ComputeNodeView", () => {
  it("renders primitive + vert/attr count meta", () => {
    const node: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "",
      count: 1024,
      primitive: "POINTS",
      attributes: [{ inName: "a_p", outName: "v_p", size: 3, seed: "sphere" }],
      uniformValues: {},
    };
    const html = renderInFlow(<ComputeNodeView {...mockProps("c1", node)} />);
    expect(html).toContain("Compute");
    expect(html).toContain("POINTS");
    expect(html).toContain("1,024");
    expect(html).toContain("1 attr");
    expect(html).toContain("handle-mesh");
    // No uniform inputs → effectively single-port → no port labels.
    expect(html).not.toContain("node-card__port-label");
  });

  it("exposes uniform input ports", () => {
    const node: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "uniform float u_dt;",
      count: 1,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    };
    const html = renderInFlow(<ComputeNodeView {...mockProps("c1", node)} />);
    expect(html).toContain("handle-float");
    expect(html).toContain(">u_dt<");
    expect(html).toContain("node-card__port-label--out");
  });
});

describe("OutputNodeView", () => {
  it("renders the static Output card with a single target handle", () => {
    const html = renderInFlow(<OutputNodeView />);
    expect(html).toContain("Output");
    expect(html).toContain("→ Canvas");
    expect(html).toContain("handle-texture");
  });
});

describe("ParamNodeView", () => {
  it("renders a float param value", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 0.42,
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("Param");
    expect(html).toContain("float");
    expect(html).toContain("0.420");
    expect(html).toContain("handle-float");
  });

  it("renders a color swatch for vec3 color params", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "color",
      value: [1, 0, 0],
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("node-card__param-swatch");
    expect(html).toContain("ff0000");
    expect(html).toContain("handle-vec3");
  });

  it("uses the custom label when defined", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 1,
      label: "Intensity",
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("Intensity");
  });
});

describe("MathNodeView", () => {
  it("renders unary op with single input handle", () => {
    const node: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "sin",
      a: 0.5,
      b: 0,
    };
    const html = renderInFlow(<MathNodeView {...mockProps("m1", node)} />);
    expect(html).toContain("Math");
    expect(html).toContain("sin");
    expect(html).toContain("a=0.50");
    expect(html).not.toContain("b=");
    expect(html).toContain("handle-float");
    // Unary keeps bare handles (single input → no labels).
    expect(html).not.toContain("node-card__port-label");
  });

  it("renders binary op with two input handles", () => {
    const node: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "add",
      a: 1,
      b: 2,
    };
    const html = renderInFlow(<MathNodeView {...mockProps("m1", node)} />);
    expect(html).toContain("a=1.00");
    expect(html).toContain("b=2.00");
    // Binary surfaces a/b/value labels to disambiguate the two inputs.
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
    expect(html).toContain(">value<");
  });
});

describe("SwizzleNodeView", () => {
  it("renders a valid mask and shows the resulting type", () => {
    const node: SwizzleGraphNode = { id: "z1", kind: "swizzle", mask: "xyz" };
    const html = renderInFlow(<SwizzleNodeView {...mockProps("z1", node)} />);
    expect(html).toContain(".xyz");
    expect(html).toContain("vec3");
    expect(html).toContain("handle-vec4"); // input
    expect(html).toContain("handle-vec3"); // output
  });

  it("flags an invalid mask", () => {
    const node: SwizzleGraphNode = { id: "z1", kind: "swizzle", mask: "abc" };
    const html = renderInFlow(<SwizzleNodeView {...mockProps("z1", node)} />);
    expect(html).toContain("invalid mask");
  });
});

describe("CombineNodeView", () => {
  it("renders arity 2 with x/y values + vec2 output", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 2,
      values: [0.1, 0.2, 0, 0],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    expect(html).toContain("Combine");
    expect(html).toContain("vec2");
    expect(html).toContain("x=0.10");
    expect(html).toContain("y=0.20");
    expect(html).not.toContain("z=");
    expect(html).toContain("handle-vec2");
    expect(html).toContain(">x<");
    expect(html).toContain(">y<");
    expect(html).toContain(">value<");
  });

  it("renders arity 4 with all four channels", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 4,
      values: [0.1, 0.2, 0.3, 0.4],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    expect(html).toContain("w=0.40");
    expect(html).toContain("handle-vec4");
  });
});

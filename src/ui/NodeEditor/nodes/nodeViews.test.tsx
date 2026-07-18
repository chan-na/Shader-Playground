import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  CombineGraphNode,
  ComputeGraphNode,
  GraphNode,
  ImageGraphNode,
  MathGraphNode,
  MeshGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
  SwizzleGraphNode,
} from "../../../core/graph/types";
import { tokens } from "../../../theme";
import { ComputeNodeView } from "./ComputeNodeView";
import { ImageNodeView } from "./ImageNodeView";
import { MeshNodeView } from "./MeshNodeView";
import { OutputNodeView } from "./OutputNodeView";
import { ParamNodeView } from "./ParamNodeView";
import { PORT_STRIDE, PORT_TOP_PAD } from "./PortHandle";
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
    // Every node now surfaces a port label so the data type is readable
    // without relying solely on the header color.
    expect(html).toContain(">mesh<");
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
    expect(html).toContain(">texture<");
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
    expect(html).toContain("node-card__port-label--in");
    expect(html).toContain("node-card__port-label--out");
    expect(html).toContain(">mesh<");
    expect(html).toContain(">texture<");
    // Thumbnail insets by the 46px port rail on both sides [D2/B5].
    expect(html).toContain("margin:0 46px");
    // Rail label color = port type family, not a static text token [D2].
    expect(html).toContain(`color:${tokens.portFamily.resource}`);
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

  it("renders the user-set name as the title instead of the kind label [D15]", () => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
      name: "Fresnel Glow",
    };
    const html = renderInFlow(<ShaderNodeView {...mockProps("s1", node)} />);
    expect(html).toContain("Fresnel Glow");
  });

  it("does not render the internal node id anywhere in the card [D15]", () => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: "",
      fragmentSource: "",
      uniformValues: {},
    };
    const html = renderInFlow(<ShaderNodeView {...mockProps("s1", node)} />);
    expect(html).not.toContain("s1");
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
    // Body is now a key-value row list (design/Node Editor.dc.html L221-225):
    // label(primitive/verts/attrs) + value, instead of a composite string.
    expect(html).toContain("POINTS");
    expect(html).toContain("verts");
    expect(html).toContain("1,024");
    expect(html).toContain("attrs");
    expect(html).toMatch(/attrs<\/span><span[^>]*>1<\/span>/);
    expect(html).toContain("handle-mesh");
    // Output port label is always emitted.
    expect(html).toContain(">mesh<");
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
    const node: GraphNode = { id: "o1", kind: "output" };
    const html = renderInFlow(<OutputNodeView {...mockProps("o1", node)} />);
    expect(html).toContain("Output");
    expect(html).toContain("→ viewport");
    expect(html).toContain("handle-texture");
    // Rail input label (texture) and body meta (→ viewport) coexist [D2].
    expect(html).toContain(">texture<");
    expect(html).toContain(`color:${tokens.portFamily.resource}`);
  });

  it("renders the custom name as the title when set [D15]", () => {
    const node: GraphNode = { id: "o1", kind: "output", name: "Main Output" };
    const html = renderInFlow(<OutputNodeView {...mockProps("o1", node)} />);
    expect(html).toContain("Main Output");
  });
});

describe("ParamNodeView", () => {
  it("renders an editable float input bound to the param value", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 0.42,
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    // Unnamed param falls back to NODE_META.param.label ("Parameter"), not
    // the legacy hardcoded "Param" string [D15].
    expect(html).toContain("Parameter");
    expect(html).toContain("float");
    // Inline numeric input must surface the canonical formatted value.
    expect(html).toContain('value="0.420"');
    expect(html).toContain('type="number"');
    expect(html).toContain("handle-float");
  });

  it("renders three editable inputs for vec3 params", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "vec3",
      value: [0.1, 0.2, 0.3],
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain('value="0.100"');
    expect(html).toContain('value="0.200"');
    expect(html).toContain('value="0.300"');
    expect(html).toContain("handle-vec3");
  });

  it("renders a color swatch + color picker for vec3 color params", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "color",
      value: [1, 0, 0],
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("node-card__param-swatch");
    expect(html).toContain("ff0000");
    expect(html).toContain('type="color"');
    expect(html).toContain("handle-vec3");
  });

  it("uses the custom name when defined", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 1,
      name: "Intensity",
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("Intensity");
  });

  // [A-1] `name` is now the only user-set title source for a param.
  it("renders the user-set name [D15·A-1]", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 1,
      name: "Wave Speed",
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).toContain("Wave Speed");
  });

  it("does not render the internal node id anywhere in the card [D15]", () => {
    const node: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 0.42,
    };
    const html = renderInFlow(<ParamNodeView {...mockProps("p1", node)} />);
    expect(html).not.toContain("p1");
  });
});

describe("MathNodeView", () => {
  it("renders unary op with one editable input", () => {
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
    // One editable field with the "a" label, and no "b" field surfaces.
    expect(html).toContain(">a<");
    expect(html).not.toContain(">b<");
    expect(html).toContain('value="0.500"');
    expect(html).toContain("handle-float");
    // Out port label is always emitted.
    expect(html).toContain(">value<");
  });

  it("renders binary op with two editable inputs", () => {
    const node: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "add",
      a: 1,
      b: 2,
    };
    const html = renderInFlow(<MathNodeView {...mockProps("m1", node)} />);
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
    expect(html).toContain('value="1.000"');
    expect(html).toContain('value="2.000"');
    expect(html).toContain(">value<");
  });

  it("does not render the internal node id anywhere in the card [D15]", () => {
    const node: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "add",
      a: 1,
      b: 2,
    };
    const html = renderInFlow(<MathNodeView {...mockProps("m1", node)} />);
    expect(html).not.toContain("m1");
  });
});

describe("SwizzleNodeView", () => {
  it("renders a valid mask and shows the resulting type", () => {
    const node: SwizzleGraphNode = { id: "z1", kind: "swizzle", mask: "xyz" };
    const html = renderInFlow(<SwizzleNodeView {...mockProps("z1", node)} />);
    expect(html).toContain('value="xyz"');
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
  it("renders arity 2 with x/y editable values + vec2 output", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 2,
      values: [0.1, 0.2, 0, 0],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    expect(html).toContain("Combine");
    expect(html).toContain("vec2");
    expect(html).toContain(">x<");
    expect(html).toContain(">y<");
    expect(html).not.toContain(">z<");
    expect(html).toContain('value="0.100"');
    expect(html).toContain('value="0.200"');
    expect(html).toContain("handle-vec2");
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
    expect(html).toContain(">w<");
    expect(html).toContain('value="0.400"');
    expect(html).toContain("handle-vec4");
  });

  it("does not render the internal node id anywhere in the card [D15]", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 2,
      values: [0.1, 0.2, 0, 0],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    expect(html).not.toContain("cb1");
  });
});

describe("fixed-arity port stride [Q7·R15]", () => {
  it("PORT_STRIDE is the CHANGELOG §v1.3 Q7 / §v1.4 R15 canonical value (27)", () => {
    expect(PORT_STRIDE).toBe(27);
  });

  it("steps Math binary op inputs by PORT_STRIDE, not the old 18-stride offset", () => {
    const node: MathGraphNode = {
      id: "m1",
      kind: "math",
      op: "add",
      a: 1,
      b: 2,
    };
    const html = renderInFlow(<MathNodeView {...mockProps("m1", node)} />);
    expect(html).toContain(`top:${PORT_TOP_PAD}px`);
    expect(html).toContain(`top:${PORT_TOP_PAD + PORT_STRIDE}px`);
    // Pre-fix artifact (PORT_STRIDE=18): 38 + 18 = 56.
    expect(html).not.toContain("top:56px");
  });

  it("steps Combine arity-4 inputs by PORT_STRIDE at every row, not the old 18-stride offsets", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 4,
      values: [0.1, 0.2, 0.3, 0.4],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    for (let i = 0; i < 4; i++) {
      expect(html).toContain(`top:${PORT_TOP_PAD + i * PORT_STRIDE}px`);
    }
    // Pre-fix artifacts (PORT_STRIDE=18): 38 + 18 = 56, 38 + 2*18 = 74.
    expect(html).not.toContain("top:56px");
    expect(html).not.toContain("top:74px");
  });

  it("keeps the output port at PORT_TOP_PAD regardless of PORT_STRIDE (single-port convention)", () => {
    const node: CombineGraphNode = {
      id: "cb1",
      kind: "combine",
      arity: 4,
      values: [0.1, 0.2, 0.3, 0.4],
    };
    const html = renderInFlow(<CombineNodeView {...mockProps("cb1", node)} />);
    // The out port renders once at PORT_TOP_PAD; dc's centered dc handle
    // (70, midway of 44-96) is a dc presentation detail pending designer
    // follow-up, not ported into this implementation's convention.
    expect(html).toContain(`top:${PORT_TOP_PAD}px`);
  });
});

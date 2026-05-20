import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";

// Phase 18 — N:1 fan-in composite. A single shader exposes three sampler
// uniforms (u_a/u_b/u_c) and three independent source shaders feed them through
// distinct target handles. This is the generalized N:1 composition: validation
// only forbids two edges into the *same* handle, so distinct handles compose
// freely. We drive red/green/blue into the three inputs and assert the
// equal-weight blend yields all three channels — a dropped or mis-routed input
// would zero out its channel.

const solidFrag = (rgb: string) => `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(${rgb}, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_c;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = (texture(u_a, uv).rgb
            + texture(u_b, uv).rgb
            + texture(u_c, uv).rgb) / 3.0;
  fragColor = vec4(col, 1.0);
}`;

function faninGraph() {
  return {
    nodes: [
      {
        id: "red",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: solidFrag("1.0, 0.0, 0.0"),
        uniformValues: {},
      },
      {
        id: "green",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: solidFrag("0.0, 1.0, 0.0"),
        uniformValues: {},
      },
      {
        id: "blue",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: solidFrag("0.0, 0.0, 1.0"),
        uniformValues: {},
      },
      {
        id: "comp",
        kind: "shader" as const,
        vertexSource: "",
        fragmentSource: COMPOSITE_FRAG,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "ea",
        source: "red",
        sourceHandle: "texture",
        target: "comp",
        targetHandle: "u_a",
      },
      {
        id: "eb",
        source: "green",
        sourceHandle: "texture",
        target: "comp",
        targetHandle: "u_b",
      },
      {
        id: "ec",
        source: "blue",
        sourceHandle: "texture",
        target: "comp",
        targetHandle: "u_c",
      },
      {
        id: "eo",
        source: "comp",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 18 — N:1 fan-in composite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("three sources blended through distinct sampler handles", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await setGraph(page, faninGraph(), {});

    const stats = await expectCanvasRendered(canvas, { ratio: 0.5 });

    // Equal-weight blend of pure R, G, B → ~85 on every channel. Each channel
    // must be clearly present; a dropped/mis-routed input would collapse one
    // toward zero. Loose bounds tolerate SwiftShader gamma/rounding.
    expect(stats.avg.r).toBeGreaterThan(40);
    expect(stats.avg.g).toBeGreaterThan(40);
    expect(stats.avg.b).toBeGreaterThan(40);
  });
});

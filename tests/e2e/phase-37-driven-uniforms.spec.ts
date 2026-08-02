import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialShaderSources } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

// Phase 37 — driven-uniform disable + note (L1/E-4), and Sampler inputs
// connection state. A uniform is also an input port (registry.ts): when a
// graph edge targets it, execute.ts's bindUserUniforms overwrites whatever
// the Inspector slider would send every frame, so the slider must disable
// itself and say who is driving it instead of silently doing nothing. The
// graph shape mirrors phase-10-params-multioutput.spec.ts's param→uniform
// pattern (mesh → shader ← param, → output).

const FRAG_WITH_TINT = trivialShaderSources.fragment
  .replace(
    "uniform vec3 u_baseColor;",
    "uniform vec3 u_baseColor;\nuniform vec3 u_tint;",
  )
  .replace(
    "fragColor = vec4(u_baseColor, 1.0);",
    "fragColor = vec4(u_baseColor * u_tint, 1.0);",
  );

function drivenUniformGraph() {
  return {
    nodes: [
      { id: "m1", kind: "mesh" as const, primitive: "sphere" },
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: trivialShaderSources.vertex,
        fragmentSource: FRAG_WITH_TINT,
        uniformValues: {
          u_baseColor: [1.0, 1.0, 1.0],
          u_tint: [0.0, 1.0, 0.0],
        },
      },
      {
        id: "p1",
        kind: "param" as const,
        name: "TintParam",
        paramKind: "color",
        value: [1.0, 0.2, 0.2],
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "em",
        source: "m1",
        sourceHandle: "mesh",
        target: "s1",
        targetHandle: "mesh",
      },
      {
        id: "et",
        source: "p1",
        sourceHandle: "value",
        target: "s1",
        targetHandle: "u_tint",
      },
      {
        id: "eo",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

const FRAG_WITH_SAMPLER = trivialShaderSources.fragment.replace(
  "uniform vec3 u_baseColor;",
  "uniform vec3 u_baseColor;\nuniform sampler2D u_tex;",
);

function samplerGraph() {
  return {
    nodes: [
      { id: "m1", kind: "mesh" as const, primitive: "sphere" },
      {
        id: "s0",
        kind: "shader" as const,
        name: "TexSource",
        vertexSource: "",
        fragmentSource: `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0, 0.5, 0.0, 1.0); }`,
        uniformValues: {},
      },
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: trivialShaderSources.vertex,
        fragmentSource: FRAG_WITH_SAMPLER,
        uniformValues: { u_baseColor: [1.0, 1.0, 1.0] },
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "em",
        source: "m1",
        sourceHandle: "mesh",
        target: "s1",
        targetHandle: "mesh",
      },
      {
        id: "etex",
        source: "s0",
        sourceHandle: "texture",
        target: "s1",
        targetHandle: "u_tex",
      },
      {
        id: "eo",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 37 — silent-failure diagnostics: driven uniforms + sampler connection state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("edge-driven uniform disables its Inspector control and shows a driven-by note; removing the edge reverts it", async ({
    page,
  }) => {
    await setGraph(page, drivenUniformGraph(), {});
    await withSp(page, (sp) => sp.selection.getState().select("s1"), undefined);

    const tintRow = page.locator(
      "[data-testid='uniform-row'][data-uniform-name='u_tint']",
    );
    await expect(tintRow).toHaveAttribute("data-driven", "true");
    await expect(tintRow.getByTestId("uniform-driven-note")).toContainText(
      "driven by",
    );
    await expect(tintRow.getByTestId("uniform-driven-note")).toContainText(
      "TintParam",
    );
    // u_tint is a vec3 without "color" in its name, so uniformParser gives it
    // the "multi" control (3 Slider + NumberField axis rows) rather than
    // ColorField — exercise that disable path here; u_baseColor below covers
    // ColorField's disable path.
    const tintRanges = tintRow.locator("input[type='range']");
    await expect(tintRanges).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(tintRanges.nth(i)).toBeDisabled();
    }
    const tintNumbers = tintRow.locator("input[type='number']");
    await expect(tintNumbers).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(tintNumbers.nth(i)).toBeDisabled();
    }

    // The sibling uniform declared on the same node, with no incoming edge,
    // is untouched — this is per-(node, uniform), not a node-wide lock.
    const baseColorRow = page.locator(
      "[data-testid='uniform-row'][data-uniform-name='u_baseColor']",
    );
    await expect(baseColorRow).toHaveAttribute("data-driven", "false");
    await expect(baseColorRow.getByTestId("uniform-driven-note")).toHaveCount(
      0,
    );
    await expect(baseColorRow.locator("input[type='color']")).toBeEnabled();

    // Remove the driving edge — the control reverts immediately (pure
    // edges-derivation, no separate un-drive step needed).
    await withSp(page, (sp) => sp.graph.getState().removeEdge("et"), undefined);

    await expect(tintRow).toHaveAttribute("data-driven", "false");
    await expect(tintRow.getByTestId("uniform-driven-note")).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await expect(tintRanges.nth(i)).toBeEnabled();
    }
  });

  test("Sampler inputs section shows the connected source's name, and 미연결 once disconnected", async ({
    page,
  }) => {
    await setGraph(page, samplerGraph(), {});
    await withSp(page, (sp) => sp.selection.getState().select("s1"), undefined);

    const row = page.locator(
      "[data-testid='sampler-input-row'][data-uniform-name='u_tex']",
    );
    await expect(row).toHaveAttribute("data-connected", "true");
    await expect(row).toContainText("← TexSource");

    await withSp(
      page,
      (sp) => sp.graph.getState().removeEdge("etex"),
      undefined,
    );

    await expect(row).toHaveAttribute("data-connected", "false");
    await expect(row).toContainText("미연결");
  });
});

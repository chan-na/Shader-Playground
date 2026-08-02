import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialShaderSources } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

/**
 * Phase 38 — mental-model correction (E-3,
 * `docs/learnability-plan-2026-08.md` T3). Image nodes upload through
 * `createImageTexture` (REPEAT + mipmap + flip-Y), while every Shader node's
 * FBO output texture is created by `createColorTexture`
 * (CLAMP_TO_EDGE, no mipmap, no flip) — the same GLSL sampling one vs. the
 * other can produce a different result (L2). This spec pins that both facts
 * are readable in the Inspector, derived from `core/gl/texture.ts`'s
 * constants rather than a hand-copied string.
 */

function imageAndShaderGraph() {
  return {
    nodes: [
      { id: "img1", kind: "image" as const, assetId: null },
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: trivialShaderSources.vertex,
        fragmentSource: trivialShaderSources.fragment,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

test.describe("Phase 38 — texture parameters (Image vs. Shader FBO)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("Image node Inspector shows REPEAT + mipmap sampling", async ({
    page,
  }) => {
    await setGraph(page, imageAndShaderGraph(), {});
    await withSp(
      page,
      (sp) => sp.selection.getState().select("img1"),
      undefined,
    );

    const section = page.getByTestId("texture-params");
    await expect(section).toBeVisible();
    await expect(section).toContainText("REPEAT");
    await expect(section).toContainText("LINEAR_MIPMAP_LINEAR");
    await expect(section).toContainText("mipmaps: yes");
  });

  test("Shader node Inspector shows the FBO output's CLAMP_TO_EDGE, no-mipmap parameters", async ({
    page,
  }) => {
    await setGraph(page, imageAndShaderGraph(), {});
    await withSp(page, (sp) => sp.selection.getState().select("s1"), undefined);

    const section = page.getByTestId("texture-params");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Output texture (FBO)");
    await expect(section).toContainText("CLAMP_TO_EDGE");
    await expect(section).toContainText("mipmaps: no");
  });

  // [E-3] The Image node card itself carries a drift-proof meta line, so the
  // sampling contract is visible without opening the Inspector at all.
  test("Image node card shows the REPEAT/mipmap meta line", async ({
    page,
  }) => {
    await setGraph(page, imageAndShaderGraph(), {});

    const card = page.locator('.react-flow__node[data-id="img1"]');
    await expect(card).toContainText("REPEAT");
    await expect(card).toContainText("mipmap");
  });
});

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { readSp, withSp } from "./sp";
import type { ShaderStage } from "./types";

/**
 * Overwrite the demo graph's shader node with the given stage sources and
 * select it so the Code panel binds to it. Stages left out keep their current
 * source. Returns the shader node's id.
 */
export async function seedShaderAndSelect(
  page: Page,
  sources: { vertex?: string; fragment?: string },
): Promise<string> {
  return withSp(
    page,
    (sp, args) => {
      const node = sp.graph.getState().nodes.find((n) => n.kind === "shader");
      if (!node) throw new Error("no shader node");
      sp.selection.getState().select(node.id);
      const patch: { vertexSource?: string; fragmentSource?: string } = {};
      if (args.vertex !== null) patch.vertexSource = args.vertex;
      if (args.fragment !== null) patch.fragmentSource = args.fragment;
      sp.graph.getState().updateShaderSource(node.id, patch);
      return node.id;
    },
    { vertex: sources.vertex ?? null, fragment: sources.fragment ?? null },
  );
}

/**
 * Switch the Code panel to `stage` and wait until the editor document shows
 * `untilText`. Returns the editor's `.cm-content` locator.
 */
export async function openStageEditor(
  page: Page,
  stage: ShaderStage,
  untilText: string,
): Promise<Locator> {
  await page.getByTestId(`stage-tab-${stage}`).click();
  const content = page.locator(".cm-content").first();
  await expect
    .poll(async () => (await content.textContent())?.includes(untilText))
    .toBe(true);
  return content;
}

/**
 * Press F2 with the cursor already on a symbol and answer the rename prompt
 * with `newName`.
 */
export async function renameViaF2(page: Page, newName: string): Promise<void> {
  page.once("dialog", (d) => {
    void d.accept(newName);
  });
  await page.keyboard.press("F2");
}

/** Both stage sources of the graph's (first) shader node, read from the store. */
export async function shaderSources(
  page: Page,
): Promise<{ vertex: string; fragment: string }> {
  return readSp(page, (sp) => {
    const node = sp.graph.getState().nodes.find((n) => n.kind === "shader") as
      | { vertexSource?: string; fragmentSource?: string }
      | undefined;
    if (!node) throw new Error("no shader node");
    return {
      vertex: node.vertexSource ?? "",
      fragment: node.fragmentSource ?? "",
    };
  });
}

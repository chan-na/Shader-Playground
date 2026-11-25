import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { boxOf } from "./helpers/dom";
import { bootApp, selectNode } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// Phase 35 — node selection drives Code's auto collapse/expand
// (`src/state/codeAutoOpen.ts`; design rule: design/CHANGELOG.md's
// "Code 자동 접기" entry and `selectNode` in design/App Shell.dc.html).
// Auto mode: selecting a shader/compute node expands Code, anything else
// collapses it, and selection wins over a manual toggle; Manual mode stops
// the automation. An empty selection leaves the current state alone.
// `.shell-code` width is the signal: expanded >100px, collapsed rail <60px.

async function shellCodeWidth(page: Page): Promise<number> {
  return (await boxOf(page.locator(".shell-code"))).width;
}

/** Resolve the demo graph's shader-kind node id and its first non-shader,
 * non-compute node id — never hardcoded, per the codeAutoOpen open-gate set
 * (`shader | compute`). */
async function demoNodeIds(
  page: Page,
): Promise<{ shaderId: string; nonShaderId: string }> {
  const ids = await readSp(page, (sp) => {
    const nodes = sp.graph.getState().nodes;
    const shader = nodes.find((n) => n.kind === "shader");
    const nonShader = nodes.find(
      (n) => n.kind !== "shader" && n.kind !== "compute",
    );
    return {
      shaderId: shader ? shader.id : null,
      nonShaderId: nonShader ? nonShader.id : null,
    };
  });
  if (ids.shaderId === null) {
    throw new Error("demo graph has no shader-kind node");
  }
  if (ids.nonShaderId === null) {
    throw new Error("demo graph has no non-shader/non-compute node");
  }
  return { shaderId: ids.shaderId, nonShaderId: ids.nonShaderId };
}

async function selectMany(page: Page, ids: string[]): Promise<void> {
  await withSp(
    page,
    (sp, args) => {
      sp.selection.getState().setSelectedIds(args.ids);
    },
    { ids },
  );
}

test.describe("Phase 35 — node selection drives Code auto collapse/expand", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("non-shader 선택은 Code를 레일로 접고 shader 선택은 다시 펼친다", async ({
    page,
  }) => {
    expect(await shellCodeWidth(page)).toBeGreaterThan(100);

    const { shaderId, nonShaderId } = await demoNodeIds(page);

    await selectNode(page, nonShaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    await selectNode(page, shaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });

  test("선택 해제는 현 상태를 유지한다", async ({ page }) => {
    const { shaderId, nonShaderId } = await demoNodeIds(page);

    // Collapsed side: select non-shader, deselect, state stays collapsed.
    await selectNode(page, nonShaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    await selectNode(page, null);
    await expect
      .poll(() => readSp(page, (sp) => sp.selection.getState().selectedNodeId))
      .toBeNull();
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    // Expanded side: select shader, deselect, state stays expanded.
    await selectNode(page, shaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);

    await selectNode(page, null);
    await expect
      .poll(() => readSp(page, (sp) => sp.selection.getState().selectedNodeId))
      .toBeNull();
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });

  test("헤더 토글 OFF는 자동 구동을 멈춘다(UI 경로)", async ({ page }) => {
    const toggle = page.getByTestId("code-auto-open-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-auto", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("data-auto", "false");

    const { nonShaderId } = await demoNodeIds(page);
    await selectNode(page, nonShaderId);
    await expect
      .poll(() => readSp(page, (sp) => sp.selection.getState().selectedNodeId))
      .toBe(nonShaderId);

    // autoCode is OFF — the non-shader selection must NOT collapse Code.
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });

  test("__sp 훅으로 autoCode를 끌 수 있다(테스트 환경 제어 경로)", async ({
    page,
  }) => {
    await withSp(
      page,
      (sp) => {
        sp.editor.getState().setAutoCode(false);
      },
      null,
    );

    const toggle = page.getByTestId("code-auto-open-toggle");
    await expect(toggle).toHaveAttribute("data-auto", "false");

    const { nonShaderId } = await demoNodeIds(page);
    await selectNode(page, nonShaderId);

    // The __sp-driven OFF must behave identically to the UI toggle's OFF —
    // this is the regression guard for the hook contract itself.
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });

  test("다중 선택은 Shader 포함 시 펼친다 + 선택이 수동보다 우선", async ({
    page,
  }) => {
    const shellCode = page.locator(".shell-code");
    await shellCode.getByRole("button", { name: "Collapse panel" }).click();
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    const { shaderId, nonShaderId } = await demoNodeIds(page);
    await selectMany(page, [nonShaderId, shaderId]);

    // Selection (Shader included) wins over the manual collapse above.
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });
});

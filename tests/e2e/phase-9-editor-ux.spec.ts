import { expect, test } from "@playwright/test";
import {
  bootApp,
  setGraph,
  trivialMeshGraph,
  trivialShaderSources,
} from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

test.describe("Phase 9 — editor UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });
    await page.getByTestId("tab-inspector").click();
    await withSp(
      page,
      (sp) => {
        sp.selection.getState().select("s1");
      },
      undefined,
    );
  });

  test("GLSL `// @range 0..5 @default 2.5` hint propagates to inspector", async ({
    page,
  }) => {
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    const frag = trivialShaderSources.fragment.replace(
      "out vec4 fragColor;",
      "uniform float u_intensity; // @range 0..5 @default 2.5 @step 0.25\nout vec4 fragColor;",
    );
    await withSp(
      page,
      (sp, args) => {
        sp.graph.getState().updateShaderSource(args.id, {
          fragmentSource: args.src,
        });
      },
      { id: "s1", src: frag },
    );
    await waitForRev(page, before);

    const row = page.locator("[data-uniform-name='u_intensity']");
    await expect(row).toBeVisible();
    // The slider input should reflect min/max/step pulled from the hint.
    const range = row.locator("input[type='range']");
    await expect(range).toHaveAttribute("min", "0");
    await expect(range).toHaveAttribute("max", "5");
    await expect(range).toHaveAttribute("step", "0.25");
  });

  test("Spacebar toggles timeStore.playing", async ({ page }) => {
    // Make sure focus is NOT inside CodeMirror.
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    const before = await readSp(page, (sp) => sp.time.getState().playing);
    await page.keyboard.press("Space");
    await expect
      .poll(() => readSp(page, (sp) => sp.time.getState().playing))
      .toBe(!before);
    await page.keyboard.press("Space");
    await expect
      .poll(() => readSp(page, (sp) => sp.time.getState().playing))
      .toBe(before);
  });

  test("Cmd+Z undoes the last node addition", async ({ page }) => {
    const startIds = await readSp(page, (sp) =>
      sp.graph.getState().nodes.map((n) => n.id),
    );
    const startCount = startIds.length;

    await withSp(
      page,
      (sp) => {
        sp.graph.getState().addNode({
          id: "undo_target",
          kind: "param",
          paramKind: "float",
          value: 0.5,
        });
      },
      undefined,
    );

    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(startCount + 1);
    // The node now present is exactly the one we asked for (C1).
    expect(
      await readSp(page, (sp) =>
        sp.graph.getState().nodes.some((n) => n.id === "undo_target"),
      ),
    ).toBe(true);

    // On mac the shortcut is Meta+Z (Playwright maps Meta to Cmd on darwin).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Meta+z");

    await expect
      .poll(() => readSp(page, (sp) => sp.graph.getState().nodes.length))
      .toBe(startCount);
    // Undo removed exactly that node and restored the original id set — a
    // length-only check would still pass if undo dropped the wrong node. (C1)
    await expect
      .poll(() =>
        readSp(page, (sp) =>
          sp.graph
            .getState()
            .nodes.map((n) => n.id)
            .sort(),
        ),
      )
      .toEqual([...startIds].sort());
  });

  test("node click drives both selectionStore and the .selected DOM class", async ({
    page,
  }) => {
    const m1 = page.locator('[data-id="m1"]');
    const s1 = page.locator('[data-id="s1"]');
    await expect(m1).toBeVisible();
    await expect(s1).toBeVisible();

    // beforeEach pre-selected "s1" via the store; the DOM must reflect it.
    await expect(s1).toHaveClass(/\bselected\b/);
    await expect(m1).not.toHaveClass(/\bselected\b/);

    // Clicking m1 must move the highlight without leaving s1 stuck.
    await m1.click();
    await expect(m1).toHaveClass(/\bselected\b/);
    await expect(s1).not.toHaveClass(/\bselected\b/);
    expect(
      await readSp(page, (sp) => sp.selection.getState().selectedNodeId),
    ).toBe("m1");

    // Pane click clears the selection in both store and DOM.
    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 10, y: 10 } });
    await expect(m1).not.toHaveClass(/\bselected\b/);
    expect(
      await readSp(page, (sp) => sp.selection.getState().selectedNodeId),
    ).toBeNull();
  });

  test("multi-select via setSelectedIds highlights every node in the set", async ({
    page,
  }) => {
    const m1 = page.locator('[data-id="m1"]');
    const s1 = page.locator('[data-id="s1"]');
    const o1 = page.locator('[data-id="o1"]');

    await withSp(
      page,
      (sp) => {
        sp.selection.getState().setSelectedIds(["m1", "s1", "o1"]);
      },
      undefined,
    );

    // All three nodes must carry the `.selected` class — the regression we hit
    // when selectionStore held only a single id and the last write clobbered
    // the rest of a shift-box select.
    await expect(m1).toHaveClass(/\bselected\b/);
    await expect(s1).toHaveClass(/\bselected\b/);
    await expect(o1).toHaveClass(/\bselected\b/);

    // Primary follows the last entry of the array.
    expect(
      await readSp(page, (sp) => sp.selection.getState().selectedNodeId),
    ).toBe("o1");

    // Pane click still clears the entire set.
    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 10, y: 10 } });
    await expect(m1).not.toHaveClass(/\bselected\b/);
    await expect(s1).not.toHaveClass(/\bselected\b/);
    await expect(o1).not.toHaveClass(/\bselected\b/);
    expect(
      await readSp(page, (sp) => sp.selection.getState().selectedNodeIds),
    ).toEqual([]);
  });

  test("Cmd+K opens the command palette", async ({ page }) => {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Meta+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toBeHidden();
  });

  test("B2 idle: paused static graph stops rendering, camera wakes it", async ({
    page,
  }) => {
    // 1. Pause time. After a short settle window the renderTick counter must
    //    stop advancing — the RAF tick is alive but `executePlan` is skipped.
    await withSp(
      page,
      (sp) => {
        sp.time.getState().setPlaying(false);
      },
      undefined,
    );
    // Give the loop one window to flush the pause-frame and the structural
    // dirty bits, then sample renderTick and confirm it's frozen.
    await page.waitForTimeout(400);
    const idleStart = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );
    await page.waitForTimeout(500);
    const idleEnd = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );
    expect(idleEnd).toBe(idleStart);

    // 2. Camera mutation must wake the loop. renderTick increases on the next
    //    frame because cameraStore.rev bumps.
    await withSp(
      page,
      (sp) => {
        const cam = sp.camera.getState().camera;
        sp.camera.getState().setCamera({ ...cam, yaw: cam.yaw + 0.1 });
      },
      undefined,
    );
    await expect
      .poll(
        () => readSp(page, (sp) => sp.renderer.getState().stats.renderTick),
        { timeout: 2_000, intervals: [100, 200] },
      )
      .toBeGreaterThan(idleEnd);
  });
});

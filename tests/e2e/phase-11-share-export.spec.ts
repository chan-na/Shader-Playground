import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

test.describe("Phase 11 — share URL & HTML export", () => {
  test("encodeShareUrl → reload with #share=... → graph restored", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);

    // Replace with a recognizable graph and snapshot the rev.
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });

    // Build a share URL through the real encoder.
    const url = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode dynamic path
      const mod = await import("/src/state/shareUrl.ts");
      const sp = window.__sp;
      if (!sp) throw new Error("sp missing");
      const g = sp.graph.getState();
      return mod.encodeShareUrl(
        { nodes: g.nodes, edges: g.edges },
        g.positions,
      );
    });
    expect(url).toMatch(/#share=/);
    const hash = `#${(url as string).split("#")[1]}`;

    // Reload the app with the share hash and confirm the graph reappears.
    await page.goto(`/${hash}`);
    await bootApp(page);

    const counts = await readSp(page, (sp) => {
      const g = sp.graph.getState();
      return {
        nodes: g.nodes.length,
        edges: g.edges.length,
        ids: g.nodes.map((n) => n.id).sort(),
      };
    });
    expect(counts.nodes).toBe(3);
    expect(counts.edges).toBe(2);
    expect(counts.ids).toEqual(["m1", "o1", "s1"]);
  });

  test("buildExportedHtml emits standalone document with embedded project", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {});

    const html = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode dynamic path
      const mod = await import("/src/export/htmlExport.ts");
      const sp = window.__sp;
      if (!sp) throw new Error("sp missing");
      const g = sp.graph.getState();
      return (
        mod.buildExportedHtml as (graph: unknown, positions: unknown) => string
      )({ nodes: g.nodes, edges: g.edges }, g.positions);
    });

    expect(typeof html).toBe("string");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("window.__SP_PROJECT = ");
    expect(html).toContain('"shader-playground"');
    // The standalone player must be present (look for a function we know it
    // defines).
    expect(html.length).toBeGreaterThan(15_000);
  });

  // #3 — "Snap PNG" no longer reads the canvas from the click handler (the
  // context uses preserveDrawingBuffer: false, so that returned a blank image
  // whenever the idle gate had skipped the draw). It now arms a one-shot
  // request that the RAF loop serves right after executePlan. Pausing first
  // puts the loop in exactly the idle state the old code failed in.
  test("Snap PNG downloads a frame captured inside the render loop", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {});
    await expectCanvasRendered(page.getByTestId("viewport-canvas"));

    // Pause and let the loop go idle (phase-9's B2 idle pattern): renderTick
    // freezes because executePlan is skipped entirely.
    await withSp(
      page,
      (sp) => {
        sp.time.getState().setPlaying(false);
      },
      undefined,
    );
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

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save viewport as PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);

    // The request must have woken the loop for a real draw — that draw is the
    // whole point, since the drawing buffer the PNG reads is only valid inside
    // the tick that produced it.
    const afterSnapshot = await readSp(
      page,
      (sp) => sp.renderer.getState().stats.renderTick,
    );
    expect(afterSnapshot).toBeGreaterThan(idleEnd);

    // The one-shot flag must be cleared, or every later frame would re-download.
    const pending = await readSp(
      page,
      (sp) => sp.renderer.getState().snapshotRequested,
    );
    expect(pending).toBe(false);
  });

  // F1 — the snapshot request must not survive the Viewport that would serve
  // it. `snapshotRequested` has exactly one reader (the RAF loop above), so a
  // request armed while the Viewport panel is closed used to sit there until
  // the panel was reopened, at which point the first frame downloaded a PNG
  // nobody had asked for. `src/ui/Viewport/index.tsx` has 0% line coverage, so
  // only an end-to-end run observes the real wiring: a closed panel means an
  // unmounted component, `setReady(false)`, and a refused request.
  test("Snap PNG with the Viewport panel closed is refused, and reopening downloads nothing", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {});
    await expectCanvasRendered(page.getByTestId("viewport-canvas"));

    // Any download from here on is a failure — register before the first click
    // so nothing can slip through between steps.
    const downloads: string[] = [];
    page.on("download", (d) => {
      downloads.push(d.suggestedFilename());
    });

    // Close the Viewport tab. The panel leaves the dock tree entirely, so
    // DockLayout stops rendering <Viewport /> and its effect cleanup runs.
    await page.getByTestId("tab-viewport").locator(".panel-tab-close").click();
    await expect(page.getByTestId("viewport-canvas")).toHaveCount(0);
    await expect
      .poll(() => readSp(page, (sp) => sp.renderer.getState().ready), {
        message: "renderer never reported the loop as stopped",
      })
      .toBe(false);

    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save viewport as PNG" }).click();

    // Refused, and the refusal is reported rather than dropped silently.
    await expect(page.getByTestId("toast")).toHaveCount(1);
    expect(
      await readSp(page, (sp) => sp.renderer.getState().snapshotRequested),
    ).toBe(false);

    // Reopen the panel and let the restored loop draw for a while. On the
    // unfixed build the armed flag is consumed by the first tick here and a
    // PNG lands; the renderTick wait guarantees we are well past that frame,
    // and the negative waitForEvent gives the async canvas.toBlob →
    // anchor.click() path (see downloadCanvasPng) time to surface a download.
    await page.getByTestId("dock-add-panel").click();
    await page.getByTestId("dock-add-panel-viewport").click();
    await expect
      .poll(() => readSp(page, (sp) => sp.renderer.getState().ready), {
        message: "renderer never came back up after re-docking",
      })
      .toBe(true);
    await expect
      .poll(
        () => readSp(page, (sp) => sp.renderer.getState().stats.renderTick),
        { message: "the re-docked Viewport never rendered a frame" },
      )
      .toBeGreaterThan(30);
    await expect(
      page.waitForEvent("download", { timeout: 5_000 }),
    ).rejects.toThrow();

    expect(downloads).toEqual([]);
    expect(
      await readSp(page, (sp) => sp.renderer.getState().snapshotRequested),
    ).toBe(false);
  });

  test("exported HTML loaded in iframe renders pixels", async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {});

    const html = await page.evaluate(async () => {
      // @ts-expect-error - dev-mode dynamic path
      const mod = await import("/src/export/htmlExport.ts");
      const sp = window.__sp;
      if (!sp) throw new Error("sp missing");
      const g = sp.graph.getState();
      return (
        mod.buildExportedHtml as (graph: unknown, positions: unknown) => string
      )({ nodes: g.nodes, edges: g.edges }, g.positions);
    });

    // Mount the exported HTML inside an iframe and look for a pixel-positive
    // canvas. We host it via blob URL so relative paths in the doc resolve.
    await page.evaluate((doc) => {
      const blob = new Blob([doc], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const ifr = document.createElement("iframe");
      ifr.id = "exported-iframe";
      ifr.src = url;
      ifr.style.width = "640px";
      ifr.style.height = "480px";
      document.body.appendChild(ifr);
    }, html);

    const frame = page.frameLocator("#exported-iframe");
    const exportedCanvas = frame.locator("#canvas");
    await expect(exportedCanvas).toBeVisible({ timeout: 10_000 });

    // Sample the iframe's canvas the same way we sample the main viewport.
    const stats = await expectCanvasRendered(exportedCanvas, {
      ratio: 0.05,
      timeout: 15_000,
    });
    expect(stats.nonZero).toBeGreaterThan(0);
  });

  // F21 — the window F1's `ready` guard deliberately left open. Collapsing a
  // slot to its rail keeps the panel mounted, so the RAF loop keeps running and
  // `ready` stays true; only CSS hides it (`.shell-slot--collapsed .panel >
  // :not(.dock-header) { display: none }`). `clientWidth/Height` then read 0,
  // `resize()` clamps them to 1x1, and the capture used to read that clamped
  // buffer — File ▸ Snap PNG downloaded a 1x1 PNG with no warning at all.
  //
  // `Viewport/index.tsx` has no unit coverage, so this spec is the only guard
  // on the wiring; the store-side invariant is pinned in `rendererStore.test`
  // and the call site in `AppToolbar.test`.
  test("Snap PNG with the Viewport collapsed into its rail is refused (F21)", async ({
    page,
  }) => {
    await page.goto("/");
    await bootApp(page);
    await setGraph(page, trivialMeshGraph(), {});
    await expectCanvasRendered(page.getByTestId("viewport-canvas"));

    // Any download from here on is a failure — register before the first click.
    const downloads: string[] = [];
    page.on("download", (d) => {
      downloads.push(d.suggestedFilename());
    });

    await page
      .locator(".shell-right-top")
      .getByRole("button", { name: "Collapse panel" })
      .click();

    // The distinguishing state: the loop is still alive (so F1's guard passes)
    // but there is nothing on screen to capture.
    await expect
      .poll(
        () => readSp(page, (sp) => sp.renderer.getState().canvasSize.width),
        { message: "the collapsed canvas never clamped to its 1px floor" },
      )
      .toBe(1);
    expect(await readSp(page, (sp) => sp.renderer.getState().ready)).toBe(true);

    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save viewport as PNG" }).click();

    // Refused, reported, and nothing armed for a later frame to serve.
    await expect(page.getByTestId("toast")).toHaveCount(1);
    expect(
      await readSp(page, (sp) => sp.renderer.getState().snapshotRequested),
    ).toBe(false);
    await expect(
      page.waitForEvent("download", { timeout: 5_000 }),
    ).rejects.toThrow();
    expect(downloads).toEqual([]);

    // Expanding again restores a real drawing buffer, and Snap PNG works — the
    // guard must gate on visibility, not latch the panel out of service.
    await page
      .locator(".shell-right-top")
      .getByRole("button", { name: "Expand panel" })
      .click();
    await expect
      .poll(
        () => readSp(page, (sp) => sp.renderer.getState().canvasSize.width),
        { message: "the expanded canvas never regained a real width" },
      )
      .toBeGreaterThan(1);

    const download = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save viewport as PNG" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
  });
});

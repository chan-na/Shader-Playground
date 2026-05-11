import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp } from "./helpers/sp";

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
});

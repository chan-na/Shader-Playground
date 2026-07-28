import { expect, test } from "@playwright/test";
import { bootApp, setGraph, trivialMeshGraph } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

test.describe("Phase 7-8 — assets & serialization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("adding a mesh handle → AssetBrowser surfaces it", async ({ page }) => {
    await page.getByTestId("tab-assets").click();

    // Inject a fake mesh handle directly into the asset store. We bypass the
    // real loader since OBJ/GLTF fixtures would add complexity without
    // covering a different code path.
    await withSp(
      page,
      (sp) => {
        // Use a tiny triangle as the mesh data so AssetBrowser has something
        // to label (vertexCount).
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);
        const handle = {
          id: "mesh-fake-tri",
          name: "fake-triangle.obj",
          data: {
            attributes: [{ name: "a_position", data: positions, size: 3 }],
            vertexCount: 3,
          },
        };
        // assetStore exposes addMesh via getState
        // biome-ignore lint/suspicious/noExplicitAny: store shape narrowed at runtime
        (sp.assets.getState() as any).addMesh(handle);
      },
      undefined,
    );

    // AssetBrowser shows the file name.
    await expect(page.getByText("fake-triangle.obj")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("3 vtx", { exact: false })).toBeVisible();
  });

  test("serialize → deserialize roundtrips the graph", async ({ page }) => {
    // Start from a known, small graph so the diff is meaningful.
    await setGraph(page, trivialMeshGraph(), {
      m1: { x: -240, y: 0 },
      s1: { x: 80, y: 0 },
      o1: { x: 400, y: 0 },
    });

    const result = await page.evaluate(async () => {
      // Pull the real serialize/deserialize from the running app via dynamic
      // import — same module the toolbar uses. `?ts=` cache-busts.
      const mod = await import(
        // @ts-expect-error - dev-mode dynamic path
        "/src/state/serialization.ts"
      );
      const sp = window.__sp;
      if (!sp) throw new Error("sp missing");
      const g = sp.graph.getState();
      const project = mod.serializeProject(
        { nodes: g.nodes, edges: g.edges },
        g.positions,
      );
      const parsed = mod.deserializeProject(
        JSON.parse(JSON.stringify(project)),
      );
      return {
        nodesIn: g.nodes.length,
        edgesIn: g.edges.length,
        nodesOut: parsed.graph.nodes.length,
        edgesOut: parsed.graph.edges.length,
        warnings: parsed.warnings,
        // Compare a single uniform value survives.
        baseColorIn: (
          g.nodes.find((n) => n.id === "s1") as {
            uniformValues?: { u_baseColor?: number[] };
          }
        )?.uniformValues?.u_baseColor,
        baseColorOut: (
          parsed.graph.nodes.find((n: { id: string }) => n.id === "s1") as {
            uniformValues?: { u_baseColor?: number[] };
          }
        )?.uniformValues?.u_baseColor,
      };
    });

    expect(result.nodesIn).toBe(3);
    expect(result.nodesOut).toBe(3);
    expect(result.edgesIn).toBe(2);
    expect(result.edgesOut).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.baseColorOut).toEqual(result.baseColorIn);
  });

  test("deserialize drops an edge into a port the node no longer declares", async ({
    page,
  }) => {
    // Projects saved before the port was retired (autosave, share URL,
    // exported JSON) carry edges nothing can reconnect. They still cost a
    // texture unit and keep upstream passes alive, so the load path drops
    // them and says which port went missing.
    const result = await page.evaluate(async () => {
      const mod = await import(
        // @ts-expect-error - dev-mode dynamic path
        "/src/state/serialization.ts"
      );
      const parsed = mod.deserializeProject({
        format: "shader-playground",
        version: 1,
        graph: {
          nodes: [
            {
              id: "s1",
              kind: "shader",
              vertexSource: "void main(){ gl_Position = vec4(0); }",
              fragmentSource:
                "precision highp float;\nuniform float u_a;\nvoid main(){}",
              uniformValues: {},
            },
            { id: "p1", kind: "param", paramKind: "float", value: 0.5 },
          ],
          edges: [
            {
              id: "live",
              source: "p1",
              sourceHandle: "value",
              target: "s1",
              targetHandle: "u_a",
            },
            {
              id: "dead",
              source: "p1",
              sourceHandle: "value",
              target: "s1",
              targetHandle: "u_gone",
            },
          ],
        },
        positions: {},
      });
      return {
        edgeIds: parsed.graph.edges.map((e: { id: string }) => e.id),
        warnings: parsed.warnings as string[],
      };
    });

    expect(result.edgeIds).toEqual(["live"]);
    expect(result.warnings.some((w) => w.includes("u_gone"))).toBe(true);
  });

  test("Image node placeholder renders when no asset bound", async ({
    page,
  }) => {
    await withSp(
      page,
      (sp) => {
        sp.graph.getState().addNode({
          id: "img1",
          kind: "image",
          assetId: null,
        });
      },
      undefined,
    );

    await expect(page.locator("[data-id='img1']")).toBeVisible({
      timeout: 5_000,
    });
    // The empty image card includes a literal "No image" string.
    await expect(
      page.locator("[data-id='img1']").getByText("No image"),
    ).toBeVisible();

    // Sanity: image asset count is 0 → Assets tab badge absent.
    const imgCount = await readSp(
      page,
      (sp) => Object.keys(sp.assets.getState().images).length,
    );
    expect(imgCount).toBe(0);
  });
});

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { expectCanvasRendered } from "./helpers/canvas";
import { bootApp, setGraph } from "./helpers/fixtures";
import { readSp, waitForRev, withSp } from "./helpers/sp";

/**
 * Phase 36 — execution pipeline visibility I (honesty recovery,
 * docs/learnability-plan-2026-08.md T1). Every value asserted here already
 * lives inside `ExecutionPlan` (`src/core/graph/compile.ts`) — this spec
 * checks that it actually reaches the DOM, not that any new computation is
 * correct.
 *
 * Covers, in order: A-1 (fullscreen substitution honesty, default demo +
 * Chain demo), C-1 (system-uniform binding tied to the same substitution),
 * D-1 (Pass Inspector: executePlan order, FBO scale, samplers, 3-way
 * overlay exclusivity, compute ping-pong), B-1 (mesh attribute contract on
 * the node card + Inspector).
 */

const PARTICLE_VERT = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_velocity;

out vec3 v_position;
out vec3 v_velocity;

uniform float u_time;
uniform float u_dt;
uniform float u_strength;

vec3 field(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.5 + t),
    sin(p.z * 1.5 + t * 1.3),
    sin(p.x * 1.5 + t * 0.7)
  );
}

void main() {
  vec3 acc = field(a_position, u_time) * u_strength;
  vec3 vel = a_velocity * 0.92 + acc * u_dt;
  vec3 pos = a_position + vel * u_dt;
  float r = length(pos);
  if (r > 1.4) {
    pos = pos * (1.4 / r);
    vel = vel * -0.5;
  }
  v_position = pos;
  v_velocity = vel;
}`;

const RENDER_VERT = `#version 300 es
precision highp float;
in vec3 a_position;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
out vec3 v_localPos;
void main() {
  v_localPos = a_position;
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
  gl_PointSize = 4.0;
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
in vec3 v_localPos;
uniform vec3 u_tint;
out vec4 outColor;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float a = 1.0 - smoothstep(0.6, 1.0, d);
  vec3 col = u_tint * (0.4 + 0.6 * length(v_localPos));
  outColor = vec4(col, a);
}`;

/** Compute → shader → output particle graph (mirrors phase-13's literal
 * fixture, duplicated rather than imported so this spec stays decoupled
 * from `src/` import paths — same rationale as phase-13-compute.spec.ts). */
function computeDemoGraph() {
  return {
    nodes: [
      {
        id: "compute1",
        kind: "compute" as const,
        vertexSource: PARTICLE_VERT,
        count: 1024,
        primitive: "POINTS" as const,
        attributes: [
          {
            inName: "a_position",
            outName: "v_position",
            size: 3,
            seed: "sphere" as const,
          },
          {
            inName: "a_velocity",
            outName: "v_velocity",
            size: 3,
            seed: "zero" as const,
          },
        ],
        uniformValues: { u_dt: 0.016, u_strength: 0.6 },
      },
      {
        id: "render1",
        kind: "shader" as const,
        vertexSource: RENDER_VERT,
        fragmentSource: POINT_FRAG,
        uniformValues: { u_tint: [1.0, 0.5, 0.2] },
      },
      { id: "output1", kind: "output" as const },
    ],
    edges: [
      {
        id: "ec",
        source: "compute1",
        sourceHandle: "mesh",
        target: "render1",
        targetHandle: "mesh",
      },
      {
        id: "er",
        source: "render1",
        sourceHandle: "texture",
        target: "output1",
        targetHandle: "texture",
      },
    ],
  };
}

/** Load the built-in Chain demo through the real toolbar preset (M1-U3's
 * "Presets" dropdown) — same path phase-5-6-graph-chain.spec.ts's chain
 * test uses, so this exercises the real preset wiring rather than a
 * hand-rolled literal. */
async function loadChainDemo(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Presets" }).click();
  await page.getByRole("menuitem", { name: "Chain", exact: true }).click();
  await expect
    .poll(() =>
      readSp(page, (sp) =>
        sp.graph.getState().nodes.find((n) => n.id === "tonemap1")
          ? "ok"
          : "no",
      ),
    )
    .toBe("ok");
}

test.describe("Phase 36 — execution pipeline visibility I", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("A-1: fullscreen substitution is shown honestly, then reverses cleanly", async ({
    page,
  }) => {
    await withSp(
      page,
      (sp) => sp.selection.getState().select("shader1"),
      undefined,
    );
    await page.getByTestId("stage-tab-vertex").click();

    const vertexTab = page.getByTestId("stage-tab-vertex");
    const content = page.locator(".cm-content").first();

    // Mesh-connected: honest vertex.glsl, editable, no auto badge anywhere.
    await expect(vertexTab).toHaveText("vertex.glsl");
    await expect(vertexTab).toHaveAttribute("data-auto", "false");
    await expect(page.getByTestId("vertex-auto-note")).toHaveCount(0);
    await expect(page.getByTestId("node-fullscreen-shader1")).toHaveCount(0);
    await expect(content).toContainText("u_view");

    // Disconnect the mesh input — the compiler falls back to fullscreen.vert.
    const meshEdge = await readSp(page, (sp) =>
      sp.graph
        .getState()
        .edges.find((e) => e.target === "shader1" && e.targetHandle === "mesh"),
    );
    if (!meshEdge) throw new Error("default demo shader1 has no mesh edge");
    await withSp(
      page,
      (sp, id) => sp.graph.getState().removeEdge(id),
      meshEdge.id,
    );

    await expect.poll(() => vertexTab.getAttribute("data-auto")).toBe("true");
    await expect(vertexTab).toHaveText("fullscreen.vert (auto)");
    await expect(page.getByTestId("vertex-auto-note")).toBeVisible();
    await expect(page.getByTestId("node-fullscreen-shader1")).toBeVisible();
    await expect(content).toContainText("v_uv = a_position * 0.5 + 0.5");

    // Read-only: a keystroke into the auto-substituted document is rejected.
    const beforeType = await content.textContent();
    await content.click();
    await page.keyboard.type("Z");
    expect(await content.textContent()).toBe(beforeType);

    // Reconnect — everything reverts, and the document is editable again.
    await withSp(
      page,
      (sp, edge) => sp.graph.getState().addEdge(edge),
      meshEdge,
    );

    await expect.poll(() => vertexTab.getAttribute("data-auto")).toBe("false");
    await expect(vertexTab).toHaveText("vertex.glsl");
    await expect(page.getByTestId("vertex-auto-note")).toHaveCount(0);
    await expect(page.getByTestId("node-fullscreen-shader1")).toHaveCount(0);

    // Editor undo must NOT resurrect the substitution: the two doc swaps
    // (user source → fullscreen.vert → user source) are dispatched with
    // addToHistory(false), so a focused Cmd+Z right after reconnecting has
    // nothing to pop. Without that, this exact gesture turned the document
    // into fullscreen.vert and committed it to the store as shader1's real
    // vertexSource. The disconnect→reconnect above is well past CM's 500ms
    // newGroupDelay (the polls in between), so the swaps could never have
    // been grouped into one harmless undo event.
    await content.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(content).not.toContainText("v_uv = a_position * 0.5 + 0.5");

    await page.keyboard.press("End");
    await page.keyboard.type("Q");
    await expect
      .poll(async () => {
        const src = await readSp(
          page,
          (sp) =>
            sp.graph.getState().nodes.find((n) => n.id === "shader1")
              ?.vertexSource,
        );
        return typeof src === "string" && src.includes("Q");
      })
      .toBe(true);
    // The committed source is still the user's document (plus the "Q"), not
    // a fullscreen.vert body that picked up the keystroke.
    const committed = await readSp(
      page,
      (sp) =>
        sp.graph.getState().nodes.find((n) => n.id === "shader1")?.vertexSource,
    );
    expect(committed).toContain("u_view");
    expect(committed).not.toContain("v_uv = a_position * 0.5 + 0.5");
  });

  test("A-1③: Chain demo — every shader node is honestly marked fullscreen", async ({
    page,
  }) => {
    await loadChainDemo(page);

    for (const id of ["noise1", "blur1", "tonemap1"]) {
      await expect(page.getByTestId(`node-fullscreen-${id}`)).toBeVisible();
    }

    await withSp(
      page,
      (sp) => sp.selection.getState().select("blur1"),
      undefined,
    );
    // Stage-independent label: activeStage still defaults to "fragment"
    // here, and the vertex tab must ALREADY tell the truth about the vertex
    // document before anyone clicks it — the node card says FULLSCREEN, so
    // a `vertex.glsl` label in the same breath would be the exact
    // contradiction A-1 removes.
    const vertexTab = page.getByTestId("stage-tab-vertex");
    await expect(vertexTab).toHaveAttribute("data-active", "false");
    await expect(vertexTab).toHaveAttribute("data-auto", "true");
    await expect(vertexTab).toHaveText("fullscreen.vert (auto)");

    await vertexTab.click();
    await expect(vertexTab).toHaveAttribute("data-auto", "true");
  });

  test("C-1: system uniforms show binding state tied to fullscreen substitution", async ({
    page,
  }) => {
    await withSp(
      page,
      (sp) => sp.selection.getState().select("shader1"),
      undefined,
    );

    const uView = page.locator(
      '[data-testid="system-uniform-row"][data-uniform-name="u_view"]',
    );
    await expect(uView).toHaveAttribute("data-bound", "true");

    const meshEdge = await readSp(page, (sp) =>
      sp.graph
        .getState()
        .edges.find((e) => e.target === "shader1" && e.targetHandle === "mesh"),
    );
    if (!meshEdge) throw new Error("default demo shader1 has no mesh edge");
    await withSp(
      page,
      (sp, id) => sp.graph.getState().removeEdge(id),
      meshEdge.id,
    );

    await expect.poll(() => uView.getAttribute("data-bound")).toBe("false");
    await expect(uView).toContainText("not bound (fullscreen pass)");
  });

  test("D-1: Pass Inspector mirrors executePlan order and toggles exclusively", async ({
    page,
  }) => {
    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();

    const rows = page.getByTestId("pass-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-node-id", "shader1");

    // 3-way exclusivity (debugUiStore/StatusOverlays): opening Diagnostics
    // closes Passes, and toggling Passes back closes Diagnostics.
    await page.getByTestId("open-diagnostics").click();
    await expect(page.getByTestId("passes-overlay")).toHaveCount(0);
    await expect(page.getByTestId("diagnostics-overlay")).toBeVisible();

    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();
    await expect(page.getByTestId("diagnostics-overlay")).toHaveCount(0);

    // resolutionScale round-trips into the FBO cell as half the base dims —
    // derived from whatever the base row actually reports, not hardcoded.
    const fboCell = page.locator(
      '[data-testid="pass-row"][data-node-id="shader1"] [data-testid="pass-fbo"]',
    );
    const baseFbo = await fboCell.textContent();
    const m = baseFbo?.match(/^(\d+)×(\d+) \(1×\)$/);
    const wStr = m?.[1];
    const hStr = m?.[2];
    if (!wStr || !hStr) throw new Error(`unexpected pass-fbo text: ${baseFbo}`);
    const halfW = Math.round(Number(wStr) * 0.5);
    const halfH = Math.round(Number(hStr) * 0.5);

    await withSp(
      page,
      (sp) => sp.selection.getState().select("shader1"),
      undefined,
    );
    const select = page.getByTestId("resolution-scale");
    await expect(select).toBeVisible();
    const before = await readSp(page, (sp) => sp.graph.getState().rev);
    await select.selectOption("0.5");
    await waitForRev(page, before);

    await expect
      .poll(() => fboCell.textContent())
      .toBe(`${halfW}×${halfH} (0.5×)`);

    // GPU column never breaks — either "—" (unsupported/disabled) or a
    // fixed-2-decimal ms value; either is fine, only NaN/undefined isn't.
    const gpuText = await page
      .locator(
        '[data-testid="pass-row"][data-node-id="shader1"] [data-testid="pass-gpu"]',
      )
      .textContent();
    expect(gpuText === "—" || /^\d+\.\d{2}$/.test(gpuText ?? "")).toBe(true);

    // Chain demo: 3 passes in the same order executePlan built them, with
    // blur1's sampler binding to noise1 visible.
    await loadChainDemo(page);
    await expect(rows).toHaveCount(3);
    const ids = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-id")),
    );
    expect(ids).toEqual(["noise1", "blur1", "tonemap1"]);

    const blurSamplers = page.locator(
      '[data-testid="pass-row"][data-node-id="blur1"] [data-testid="pass-samplers"]',
    );
    await expect(blurSamplers).toContainText("u_tex ←");
    await expect(blurSamplers).toContainText(/\(unit \d+\)/);
  });

  test("D-1③: compute demo's ping-pong read side is visible and live", async ({
    page,
  }) => {
    const canvas = page.getByTestId("viewport-canvas");
    await setGraph(page, computeDemoGraph(), {});
    await expectCanvasRendered(canvas, { ratio: 0.005, timeout: 15_000 });

    await page.getByTestId("status-passes").click();
    await expect(page.getByTestId("passes-overlay")).toBeVisible();

    const rows = page.getByTestId("pass-row");
    await expect(rows).toHaveCount(2);
    const ids = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-id")),
    );
    expect(ids).toEqual(["compute1", "render1"]);

    const computeMesh = page.locator(
      '[data-testid="pass-row"][data-node-id="compute1"] [data-testid="pass-mesh"]',
    );
    await expect(computeMesh).toContainText("read=");

    // The ping-pong read side flips every frame; polling (250ms app-side tick,
    // generous timeout here) must observe at least one A↔B transition.
    const first = await computeMesh.textContent();
    await expect
      .poll(async () => (await computeMesh.textContent()) !== first, {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test("B-1: mesh attribute contract is visible on the card and in Inspector", async ({
    page,
  }) => {
    const contract = page.getByTestId("mesh-contract");
    await expect(contract).toContainText(
      "a_position vec3 · a_normal vec3 · a_uv vec2",
    );
    await expect(contract).toContainText("verts");

    await withSp(
      page,
      (sp) => sp.selection.getState().select("mesh1"),
      undefined,
    );
    await expect(page.getByTestId("mesh-attributes")).toBeVisible();
  });
});

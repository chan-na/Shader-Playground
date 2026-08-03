import { expect, test } from "@playwright/test";
import { bootApp, setGraph } from "./helpers/fixtures";
import { withSp } from "./helpers/sp";

/**
 * Phase 39 — varying contract visualization (A-2,
 * `docs/learnability-plan-2026-08.md` T4). GLSL links a vertex `out` to a
 * fragment `in` of the same name implicitly — there is no port/edge for it
 * anywhere in this app's graph. `core/glsl/varyingContract.ts` diffs the two
 * stages' declarations (reusing the existing symbol table, not a new
 * scanner) and `passPlanStore.varyingsByNode` publishes the result on every
 * recompile, exactly like Phase 36/37's `passPlanStore` fields.
 *
 * Every fixture here deliberately omits (or includes) a mesh edge to control
 * whether the vertex stage the compiler actually sees is the user's source
 * or the `fullscreen.vert` substitution (A-1) — the contract is always
 * computed from `plan.compiledVertexSource`, never `node.vertexSource`.
 */

const PLACEHOLDER_VERT = `#version 300 es
in vec3 a_position;
void main() {
  gl_Position = vec4(a_position, 1.0);
}`;

// fullscreen.vert (src/shaders/fullscreen.vert) only provides `out vec2
// v_uv;` — a fragment that declares and uses exactly that varying links
// cleanly against the auto-substituted vertex stage.
const FRAG_USES_V_UV = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_uv, 0.0, 1.0);
}`;

// Declares (and statically uses) `v_normal`, which neither fullscreen.vert
// nor any vertex stage in this fixture provides — a confident, fragment-
// used "missing-out" row, and a real WebGL link failure (not asserted here
// — see the "다른 에러 행의 존재/부재는 단언하지 말 것" note in the unit
// brief; only the varying-bridge/ProblemsPanel rows are).
const FRAG_USES_V_NORMAL = `#version 300 es
precision highp float;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_normal, 1.0);
}`;

// Declares `v_ghost` but never references it again — GLSL ES 3.0's
// "statically used" link condition means this is legal even though no
// vertex stage anywhere provides `v_ghost`. Compiles and links fine.
const FRAG_DECLARES_UNUSED_V_GHOST = `#version 300 es
precision highp float;
in vec3 v_ghost;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;

// basic.vert-shaped: emits both v_uv and v_normal, mesh-connected so the
// compiler sees this source verbatim (no fullscreen substitution).
const VERT_EMITS_UV_AND_NORMAL = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;
out vec2 v_uv;
out vec3 v_normal;
void main() {
  v_uv = a_uv;
  v_normal = a_normal;
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
}`;

/** Mesh-disconnected shader — the compiler substitutes fullscreen.vert. */
function meshDisconnectedGraph(fragmentSource: string) {
  return {
    nodes: [
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource: PLACEHOLDER_VERT,
        fragmentSource,
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

// Comma multi-declaration (`out vec2 v_uv, v_st;`) — legal GLSL that the
// symbol table's old single-declarator regex rejected wholesale, which made
// the bridge report a *confident* "missing-out" (link-error) warning for
// BOTH names while the real program compiled and linked fine. Regression
// guard for the T4 verification fix (declarator walk in symbolTable.ts).
const VERT_COMMA_DECL = `#version 300 es
in vec3 a_position;
in vec2 a_uv;
out vec2 v_uv, v_st;
void main() {
  v_uv = a_uv;
  v_st = a_uv * 2.0;
  gl_Position = vec4(a_position, 1.0);
}`;

const FRAG_USES_UV_AND_ST = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_st;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_uv, v_st);
}`;

// Vertex `out` that only exists inside a dead `#ifdef` branch. The symbol
// table parses every branch unconditionally, so the diff alone would say
// "linked" — but the real program fails to link (the fragment statically
// uses v_x and no live branch provides it). confident=false must hold the
// verdict in BOTH directions: no ⚠ warning AND no green ✓.
const VERT_IFDEF_DEAD_OUT = `#version 300 es
in vec3 a_position;
#ifdef USE_X
out vec3 v_x;
#endif
void main() {
#ifdef USE_X
  v_x = a_position;
#endif
  gl_Position = vec4(a_position, 1.0);
}`;

const FRAG_USES_V_X = `#version 300 es
precision highp float;
in vec3 v_x;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_x, 1.0);
}`;

/** Sphere mesh → shader (real vertex source, no fullscreen substitution). */
function meshConnectedGraph(
  vertexSource: string = VERT_EMITS_UV_AND_NORMAL,
  fragmentSource: string = FRAG_USES_V_UV,
) {
  return {
    nodes: [
      { id: "m1", kind: "mesh" as const, primitive: "sphere" },
      {
        id: "s1",
        kind: "shader" as const,
        vertexSource,
        fragmentSource,
        uniformValues: {},
      },
      { id: "o1", kind: "output" as const },
    ],
    edges: [
      {
        id: "e1",
        source: "m1",
        sourceHandle: "mesh",
        target: "s1",
        targetHandle: "mesh",
      },
      {
        id: "e2",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

async function selectNode(page: import("@playwright/test").Page, id: string) {
  await withSp(
    page,
    (sp, nodeId) => sp.selection.getState().select(nodeId),
    id,
  );
}

test.describe("Phase 39 — varying contract visualization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("linked: fullscreen-substituted vertex satisfies fragment's v_uv, no warnings", async ({
    page,
  }) => {
    await setGraph(page, meshDisconnectedGraph(FRAG_USES_V_UV), {});
    await selectNode(page, "s1");

    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_uv"][data-status="linked"]',
      ),
    ).toBeVisible();

    await page.getByTestId("status-problems").click();
    await expect(
      page.locator('[data-testid="varying-warning-row"]'),
    ).toHaveCount(0);
  });

  test("missing-out: fragment statically uses v_normal but no stage provides it — pre-link warning", async ({
    page,
  }) => {
    await setGraph(page, meshDisconnectedGraph(FRAG_USES_V_NORMAL), {});
    await selectNode(page, "s1");

    // Bridge row in the Inspector reports the mismatch...
    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_normal"][data-status="missing-out"]',
      ),
    ).toBeVisible();

    // ...and ProblemsPanel surfaces it as a warning before the linker even
    // has a chance to speak (StatusBar's status-problems trigger, same
    // precedent as phase-37-silent-failures.spec.ts). This graph also fails
    // to actually link — deliberately not asserting on any other
    // diagnostic row's presence/absence here.
    await page.getByTestId("status-problems").click();
    await expect(
      page.locator(
        '[data-testid="varying-warning-row"][data-varying-name="v_normal"]',
      ),
    ).toBeVisible();
  });

  test("mesh connection resolves v_uv to linked and surfaces v_normal as unused, no warnings", async ({
    page,
  }) => {
    await setGraph(page, meshConnectedGraph(), {});
    await selectNode(page, "s1");

    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_uv"][data-status="linked"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_normal"][data-status="unused"]',
      ),
    ).toBeVisible();

    await page.getByTestId("status-problems").click();
    await expect(
      page.locator('[data-testid="varying-warning-row"]'),
    ).toHaveCount(0);
  });

  test("comma multi-declaration links both varyings — no false link-error warning", async ({
    page,
  }) => {
    await setGraph(
      page,
      meshConnectedGraph(VERT_COMMA_DECL, FRAG_USES_UV_AND_ST),
      {},
    );
    await selectNode(page, "s1");

    // Both declarators of `out vec2 v_uv, v_st;` must resolve to linked —
    // the linker succeeds on this graph, and the UI must not contradict it.
    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_uv"][data-status="linked"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_st"][data-status="linked"]',
      ),
    ).toBeVisible();
    await expect(page.getByTestId("varying-bridge")).toHaveAttribute(
      "data-confident",
      "true",
    );

    await page.getByTestId("status-problems").click();
    await expect(
      page.locator('[data-testid="varying-warning-row"]'),
    ).toHaveCount(0);
  });

  test("dead-#ifdef vertex out: verdict held — no green checkmark and no warning", async ({
    page,
  }) => {
    await setGraph(
      page,
      meshConnectedGraph(VERT_IFDEF_DEAD_OUT, FRAG_USES_V_X),
      {},
    );
    await selectNode(page, "s1");

    // The diff's factual status is still shown (the symbol table saw the
    // dead branch's `out`), but with confidence withdrawn the row must NOT
    // carry the green ✓ — the real program fails to link on this graph, so
    // asserting "linked" would contradict the node's ErrorBadge.
    const bridge = page.getByTestId("varying-bridge");
    await expect(bridge).toHaveAttribute("data-confident", "false");
    await expect(bridge).toContainText("판정 보류");

    const row = page.locator(
      '[data-testid="varying-row"][data-varying-name="v_x"][data-status="linked"]',
    );
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("✓");

    await page.getByTestId("status-problems").click();
    await expect(
      page.locator('[data-testid="varying-warning-row"]'),
    ).toHaveCount(0);
  });

  test("statically-unused suppression: declared-only v_ghost never warns (regression guard)", async ({
    page,
  }) => {
    await setGraph(
      page,
      meshDisconnectedGraph(FRAG_DECLARES_UNUSED_V_GHOST),
      {},
    );
    await selectNode(page, "s1");

    // The bridge row still reports the (harmless) mismatch...
    await expect(
      page.locator(
        '[data-testid="varying-row"][data-varying-name="v_ghost"][data-status="missing-out"]',
      ),
    ).toBeVisible();

    // ...but because v_ghost is never statically used, GLSL ES 3.0 doesn't
    // require a matching vertex output and the real link succeeds — so no
    // warning row must appear. This is the false-positive suppression this
    // module exists to guarantee (core/glsl/varyingContract.ts's
    // `isStaticallyUsed`/`confidentVaryingWarnings`).
    await page.getByTestId("status-problems").click();
    await expect(
      page.locator('[data-testid="varying-warning-row"]'),
    ).toHaveCount(0);
  });
});

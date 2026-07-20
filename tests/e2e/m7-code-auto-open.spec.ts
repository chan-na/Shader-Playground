import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/fixtures";
import { readSp, withSp } from "./helpers/sp";

// M7/W5 regression guard — node selection driving Code's auto collapse/
// expand (design/CHANGELOG.md §v2.0 W5 + design/App Shell.dc.html
// `selectNode`, L773-786). Primary sources, quoted:
//
//   design/CHANGELOG.md §v2.0 W5: "**Auto → W5-(a)**: 노드 선택이 항상 Code
//   접힘/펼침을 구동(Shader→펼침, 그 외→접힘), 수동보다 우선. **Manual → 자동
//   구동 정지**, 수동 토글(헤더 chevron)만 적용. 빈 캔버스 클릭(선택 해제)
//   시 현 상태 유지. 다중 선택 시 Shader 포함이면 펼침(Auto 한정)."
//
//   design/App Shell.dc.html L773-786 (`selectNode`):
//     selectNode(id) {
//       if (!this.state.autoCode) { this.setState({ sel: id }); return; }
//       const wantOpen = id === "shader";
//       let tree = this.state.layout;
//       const path = this._pathOfTab(tree, "code");
//       if (path) {
//         const node = this._getAt(tree, path);
//         if (node.type === "leaf" && !!node.collapsed === wantOpen) {
//           tree = this._setAt(tree, path, { ...node, collapsed: !wantOpen });
//         }
//       }
//       this.setState({ sel: id, layout: tree });
//     }
//
// The shipped implementation (src/state/codeAutoOpen.ts) generalizes
// dc's shader-only `wantOpen` to `shader || compute` (CodeEditor edits
// compute vertex sources too — see that file's header comment) and treats
// an empty selection as "leave current state" rather than dc's implicit
// "no id ever equals shader" no-op; both are exercised below.
//
// Conventions borrowed from m1-dock-header-collapse.spec.ts: bootApp
// fixture, `.shell-code` boundingBox width as the collapsed/expanded signal
// (expanded >100px / collapsed 34px rail <60px), and the header's own
// "Collapse panel" aria-label button for a manual toggle. Demo graph node
// ids are never hardcoded — every test resolves the shader-kind node and the
// first non-shader/non-compute node via `readSp` against the live graph
// (`src/state/demoGraph.ts`'s `createDemoGraph()`, booted by default).

async function shellCodeWidth(page: Page): Promise<number> {
  const box = await page.locator(".shell-code").boundingBox();
  if (!box) throw new Error("shell-code has no bounding box");
  return box.width;
}

/** Resolve the demo graph's shader-kind node id and its first non-shader,
 * non-compute node id (mesh/output in the default demo graph) — never
 * hardcoded, per the codeAutoOpen open-gate set (`shader | compute`). */
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

async function selectOne(page: Page, id: string): Promise<void> {
  await withSp(
    page,
    (sp, args) => {
      sp.selection.getState().select(args.id);
    },
    { id },
  );
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

async function deselect(page: Page): Promise<void> {
  await withSp(
    page,
    (sp) => {
      sp.selection.getState().select(null);
    },
    null,
  );
}

test.describe("M7 — node selection drives Code auto collapse/expand (W5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await bootApp(page);
  });

  test("non-shader 선택은 Code를 레일로 접고 shader 선택은 다시 펼친다", async ({
    page,
  }) => {
    expect(await shellCodeWidth(page)).toBeGreaterThan(100);

    const { shaderId, nonShaderId } = await demoNodeIds(page);

    await selectOne(page, nonShaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    await selectOne(page, shaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);
  });

  test("선택 해제는 현 상태를 유지한다", async ({ page }) => {
    const { shaderId, nonShaderId } = await demoNodeIds(page);

    // Collapsed side: select non-shader, deselect, state stays collapsed.
    await selectOne(page, nonShaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    await deselect(page);
    await expect
      .poll(() => readSp(page, (sp) => sp.selection.getState().selectedNodeId))
      .toBeNull();
    await expect.poll(() => shellCodeWidth(page)).toBeLessThan(60);

    // Expanded side: select shader, deselect, state stays expanded.
    await selectOne(page, shaderId);
    await expect.poll(() => shellCodeWidth(page)).toBeGreaterThan(100);

    await deselect(page);
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
    await selectOne(page, nonShaderId);
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
    await selectOne(page, nonShaderId);

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

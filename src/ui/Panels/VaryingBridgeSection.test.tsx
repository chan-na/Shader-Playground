import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NodeVaryingRow, NodeVaryings } from "../../state/passPlanStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { VaryingBridgeSection } from "./VaryingBridgeSection";

const initialPassPlan = usePassPlanStore.getState();

function resetStores() {
  usePassPlanStore.setState(initialPassPlan, true);
}

afterEach(() => {
  cleanup();
  resetStores();
});

function contractOf(rows: NodeVaryingRow[], confident = true): NodeVaryings {
  return { rows, confident };
}

function seed(nodeId: string, contract: NodeVaryings, fullscreen = false) {
  usePassPlanStore
    .getState()
    .publish([], { [nodeId]: fullscreen }, { [nodeId]: contract });
}

function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("varying-row")
    .find((r) => r.getAttribute("data-varying-name") === name);
  if (!row) throw new Error(`varying-row not found: ${name}`);
  return row;
}

describe("VaryingBridgeSection — absence", () => {
  it("renders nothing when there is no contract published for this node", () => {
    const { container } = render(<VaryingBridgeSection nodeId="s1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the contract has zero rows", () => {
    seed("s1", contractOf([]));
    const { container } = render(<VaryingBridgeSection nodeId="s1" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("VaryingBridgeSection — row states", () => {
  it("shows a linked row with its type and a checkmark", () => {
    seed(
      "s1",
      contractOf([
        {
          name: "v_uv",
          vertexType: "vec2",
          fragmentType: "vec2",
          fragmentUsed: true,
          status: "linked",
        },
      ]),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_uv");
    expect(row.getAttribute("data-status")).toBe("linked");
    expect(row.textContent).toContain("v_uv");
    expect(row.textContent).toContain("vec2");
    expect(row.textContent).toContain("✓");

    // Confident contract: no verdict-hold caption, and the section says so.
    const section = screen.getByTestId("varying-bridge");
    expect(section.getAttribute("data-confident")).toBe("true");
    expect(section.textContent).not.toContain("판정 보류");
  });

  it("withholds the linked checkmark and shows the verdict-hold caption when the contract is not confident", () => {
    // confident=false means the declaration set the diff saw may not be what
    // actually compiled (e.g. a vertex `out` inside a dead `#ifdef` branch)
    // — a green ✓ from that diff can contradict a real link failure's
    // ErrorBadge, so the positive assertion is held exactly like the ⚠ is.
    seed(
      "s1",
      contractOf(
        [
          {
            name: "v_x",
            vertexType: "vec3",
            fragmentType: "vec3",
            fragmentUsed: true,
            status: "linked",
          },
        ],
        false,
      ),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_x");
    // The factual diff status stays visible — only the verdict is held.
    expect(row.getAttribute("data-status")).toBe("linked");
    expect(row.textContent).not.toContain("✓");

    const section = screen.getByTestId("varying-bridge");
    expect(section.getAttribute("data-confident")).toBe("false");
    expect(section.textContent).toContain(
      "파서가 확신할 수 없는 선언 형태 — 판정 보류",
    );
  });

  it("shows an unused row as muted with no checkmark and no warning glyph", () => {
    seed(
      "s1",
      contractOf([
        {
          name: "v_normal",
          vertexType: "vec3",
          fragmentType: null,
          fragmentUsed: false,
          status: "unused",
        },
      ]),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_normal");
    expect(row.getAttribute("data-status")).toBe("unused");
    expect(row.textContent).toContain("미사용 — fragment가 받지 않음");
    expect(row.textContent).not.toContain("✓");
    expect(row.textContent).not.toContain("⚠");
    expect(screen.getByText("v_normal").style.color).toBe(
      "var(--text-disabled)",
    );
  });

  it("withholds the unused note and its muting when the contract is not confident", () => {
    // "fragment가 받지 않음" asserts as much as the ✓ does, and it fabricates
    // the same way: an unterminated `/*` in the fragment source erases every
    // `in` below it, so vertex outputs that *are* consumed show up as unused.
    // Same hold as the linked ✓ — the factual status stays, the verdict goes.
    seed(
      "s1",
      contractOf(
        [
          {
            name: "v_normal",
            vertexType: "vec3",
            fragmentType: null,
            fragmentUsed: false,
            status: "unused",
          },
        ],
        false,
      ),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_normal");
    expect(row.getAttribute("data-status")).toBe("unused");
    expect(row.textContent).not.toContain("미사용 — fragment가 받지 않음");
    expect(screen.getByText("v_normal").style.color).toBe("");
    expect(row.textContent).not.toContain("✓");
    expect(row.textContent).not.toContain("⚠");
  });

  it("warns on a confident, statically-used missing-out row", () => {
    seed(
      "s1",
      contractOf([
        {
          name: "v_foo",
          vertexType: null,
          fragmentType: "vec3",
          fragmentUsed: true,
          fragmentLine: 4,
          status: "missing-out",
        },
      ]),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_foo");
    expect(row.getAttribute("data-status")).toBe("missing-out");
    expect(row.textContent).toContain("⚠");
    expect(row.textContent).toContain("vertex가 제공하지 않음");
  });

  it("mutes a statically-unused missing-out row with no warning glyph", () => {
    seed(
      "s1",
      contractOf([
        {
          name: "v_ghost",
          vertexType: null,
          fragmentType: "vec2",
          fragmentUsed: false,
          status: "missing-out",
        },
      ]),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_ghost");
    expect(row.textContent).not.toContain("⚠");
    expect(row.textContent).toContain("선언만 있고 미사용 — 링크는 통과");
  });

  it("shows a pending-verdict note (no glyph) for a used-but-unconfident missing-out row", () => {
    seed(
      "s1",
      contractOf(
        [
          {
            name: "v_branch",
            vertexType: null,
            fragmentType: "vec2",
            fragmentUsed: true,
            status: "missing-out",
          },
        ],
        false,
      ),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_branch");
    expect(row.textContent).not.toContain("⚠");
    expect(row.textContent).toContain(
      "파서가 확신할 수 없는 선언 형태 — 판정 보류",
    );
  });

  it("warns on a confident, statically-used type-mismatch row with both types named", () => {
    seed(
      "s1",
      contractOf([
        {
          name: "v_x",
          vertexType: "vec2",
          fragmentType: "vec3",
          fragmentUsed: true,
          status: "type-mismatch",
        },
      ]),
    );
    render(<VaryingBridgeSection nodeId="s1" />);

    const row = rowFor("v_x");
    expect(row.textContent).toContain("⚠");
    expect(row.textContent).toContain("vec2");
    expect(row.textContent).toContain("vec3");
  });
});

describe("VaryingBridgeSection — fullscreen caption", () => {
  const rows: NodeVaryingRow[] = [
    {
      name: "v_uv",
      vertexType: "vec2",
      fragmentType: "vec2",
      fragmentUsed: true,
      status: "linked",
    },
  ];

  it("names fullscreen.vert as the vertex source when the node compiled as fullscreen", () => {
    seed("s1", contractOf(rows), true);
    render(<VaryingBridgeSection nodeId="s1" />);
    expect(screen.getByTestId("varying-bridge").textContent).toContain(
      "vertex 계약 출처: fullscreen.vert (auto)",
    );
  });

  it("omits the fullscreen note when the node resolved a real mesh", () => {
    seed("s1", contractOf(rows), false);
    render(<VaryingBridgeSection nodeId="s1" />);
    expect(screen.getByTestId("varying-bridge").textContent).not.toContain(
      "fullscreen.vert (auto)",
    );
  });
});

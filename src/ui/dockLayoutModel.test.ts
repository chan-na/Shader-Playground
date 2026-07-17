import { describe, expect, it } from "vitest";
import {
  COLLAPSED_STRIP_PX,
  createDefaultDockTree,
  type DockLeaf,
  type DockSplit,
} from "../state/dockTree";
import {
  collapsesToRail,
  leafPanelKind,
  legacyLeafClass,
  PANEL_TITLES,
  splitChildFlex,
  splitterLabel,
} from "./dockLayoutModel";

function leaf(
  tabs: DockLeaf["tabs"],
  active: DockLeaf["tabs"][number],
  collapsed?: boolean,
): DockLeaf {
  return collapsed === undefined
    ? { type: "leaf", id: "x", tabs, active }
    : { type: "leaf", id: "x", tabs, active, collapsed };
}

const tree = createDefaultDockTree();
if (tree.type !== "split") throw new Error("default tree root must be split");
const middleSplit = tree.a;
if (middleSplit.type !== "split") throw new Error("tree.a must be split");
const innerSplit = middleSplit.b;
if (innerSplit.type !== "split") throw new Error("tree.a.b must be split");

describe("leafPanelKind", () => {
  it("maps a single-tab nodeEditor leaf to nodeEditor", () => {
    expect(leafPanelKind(leaf(["nodeEditor"], "nodeEditor"))).toBe(
      "nodeEditor",
    );
  });

  it("maps a single-tab viewport leaf to viewport", () => {
    expect(leafPanelKind(leaf(["viewport"], "viewport"))).toBe("viewport");
  });

  it("maps a single-tab code leaf to code", () => {
    expect(leafPanelKind(leaf(["code"], "code"))).toBe("code");
  });

  it("maps a single-tab inspector leaf to sidePanel", () => {
    expect(leafPanelKind(leaf(["inspector"], "inspector"))).toBe("sidePanel");
  });

  it("maps a single-tab assets leaf to sidePanel", () => {
    expect(leafPanelKind(leaf(["assets"], "assets"))).toBe("sidePanel");
  });

  it("maps a mixed inspector+assets leaf to sidePanel regardless of tabs[0]", () => {
    expect(leafPanelKind(leaf(["inspector", "assets"], "assets"))).toBe(
      "sidePanel",
    );
  });

  it("returns null for an empty tabs array (tabs[0] is undefined)", () => {
    expect(
      leafPanelKind({ type: "leaf", id: "x", tabs: [], active: "code" }),
    ).toBe(null);
  });
});

describe("legacyLeafClass", () => {
  it("maps nodeEditor to shell-left", () => {
    expect(legacyLeafClass(leaf(["nodeEditor"], "nodeEditor"))).toBe(
      "shell-left",
    );
  });

  it("maps viewport to shell-right-top", () => {
    expect(legacyLeafClass(leaf(["viewport"], "viewport"))).toBe(
      "shell-right-top",
    );
  });

  it("maps sidePanel (inspector/assets) to shell-right-bottom", () => {
    expect(legacyLeafClass(leaf(["inspector", "assets"], "inspector"))).toBe(
      "shell-right-bottom",
    );
  });

  it("maps code to shell-code", () => {
    expect(legacyLeafClass(leaf(["code"], "code"))).toBe("shell-code");
  });

  it("returns null for an unmappable (empty-tabs) leaf", () => {
    expect(
      legacyLeafClass({ type: "leaf", id: "x", tabs: [], active: "code" }),
    ).toBe(null);
  });
});

describe("splitChildFlex", () => {
  const normalSplit: DockSplit = {
    type: "split",
    dir: "row",
    ratio: 0.6,
    a: leaf(["nodeEditor"], "nodeEditor"),
    b: leaf(["viewport"], "viewport"),
  };

  it("returns ratio-based flex for both sides with the divider shown when neither side is collapsed", () => {
    expect(splitChildFlex(normalSplit)).toEqual({
      a: "0.6 1 0px",
      b: "0.4 1 0px",
      showDivider: true,
    });
  });

  it("collapses side a to a fixed strip and gives b the divider-free remainder", () => {
    const split: DockSplit = {
      ...normalSplit,
      a: leaf(["nodeEditor"], "nodeEditor", true),
    };
    expect(splitChildFlex(split)).toEqual({
      a: `0 0 ${COLLAPSED_STRIP_PX}px`,
      b: "0.4 1 0px",
      showDivider: false,
    });
  });

  it("collapses side b to a fixed strip and gives a the divider-free remainder", () => {
    const split: DockSplit = {
      ...normalSplit,
      b: leaf(["viewport"], "viewport", true),
    };
    expect(splitChildFlex(split)).toEqual({
      a: "0.6 1 0px",
      b: `0 0 ${COLLAPSED_STRIP_PX}px`,
      showDivider: false,
    });
  });

  it("falls back to ratio-based flex with no divider when both sides are (artificially) collapsed", () => {
    const split: DockSplit = {
      ...normalSplit,
      a: leaf(["nodeEditor"], "nodeEditor", true),
      b: leaf(["viewport"], "viewport", true),
    };
    expect(splitChildFlex(split)).toEqual({
      a: "0.6 1 0px",
      b: "0.4 1 0px",
      showDivider: false,
    });
  });

  it("only treats a direct leaf child's own collapsed flag as aCol/bCol (a collapsed descendant deeper down doesn't count)", () => {
    const split: DockSplit = {
      type: "split",
      dir: "col",
      ratio: 0.5,
      a: {
        type: "split",
        dir: "row",
        ratio: 0.5,
        a: leaf(["nodeEditor"], "nodeEditor", true),
        b: leaf(["viewport"], "viewport"),
      },
      b: leaf(["code"], "code"),
    };
    expect(splitChildFlex(split)).toEqual({
      a: "0.5 1 0px",
      b: "0.5 1 0px",
      showDivider: true,
    });
  });
});

describe("collapsesToRail", () => {
  it("is true for a leaf whose direct parent split is row-direction (l1 nodeEditor, path [a,a])", () => {
    expect(collapsesToRail(tree, ["a", "a"])).toBe(true);
  });

  it("is false for a leaf whose direct parent split is col-direction (l2 viewport, path [a,b,a])", () => {
    expect(collapsesToRail(tree, ["a", "b", "a"])).toBe(false);
  });

  it("is false for a leaf whose direct parent is the col-direction root split (l4 code, path [b])", () => {
    expect(collapsesToRail(tree, ["b"])).toBe(false);
  });

  it("is false for the root path (no parent to inspect)", () => {
    expect(collapsesToRail(tree, [])).toBe(false);
  });

  it("is false for a null tree", () => {
    expect(collapsesToRail(null, ["a", "a"])).toBe(false);
  });

  it("is false for a path that descends past a leaf (invalid path)", () => {
    expect(collapsesToRail(tree, ["a", "a", "a"])).toBe(false);
  });
});

describe("splitterLabel", () => {
  it("labels the inner split (viewport | inspector/assets)", () => {
    expect(splitterLabel(innerSplit)).toBe(
      "Resize Viewport and Inspector / Assets",
    );
  });

  it("labels the middle split (nodeEditor | inner split)", () => {
    expect(splitterLabel(middleSplit)).toBe(
      "Resize Node Editor and Viewport and Inspector / Assets",
    );
  });

  it("labels the root split (middle split | code)", () => {
    expect(splitterLabel(tree)).toBe(
      "Resize Node Editor and Viewport and Inspector / Assets and Code",
    );
  });
});

describe("PANEL_TITLES", () => {
  it("covers all 5 dockable panel ids with the dc META titles", () => {
    expect(PANEL_TITLES).toEqual({
      nodeEditor: "Node Editor",
      viewport: "Viewport",
      inspector: "Inspector",
      code: "Code",
      assets: "Assets",
    });
  });
});

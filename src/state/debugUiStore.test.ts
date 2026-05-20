import { beforeEach, describe, expect, it } from "vitest";
import { useDebugUiStore } from "./debugUiStore";

function snapshot() {
  return useDebugUiStore.getState();
}

describe("debugUiStore", () => {
  beforeEach(() => {
    const s = useDebugUiStore.getState();
    s.setOpen(false);
    s.setLevelFilter("all");
    s.setCategoryFilter("all");
  });

  it("defaults to closed with no filters", () => {
    const s = snapshot();
    expect(s.open).toBe(false);
    expect(s.levelFilter).toBe("all");
    expect(s.categoryFilter).toBe("all");
  });

  it("toggleOpen flips the open flag", () => {
    snapshot().toggleOpen();
    expect(snapshot().open).toBe(true);
    snapshot().toggleOpen();
    expect(snapshot().open).toBe(false);
  });

  it("setOpen sets the open flag directly", () => {
    snapshot().setOpen(true);
    expect(snapshot().open).toBe(true);
  });

  it("setLevelFilter / setCategoryFilter store the selection", () => {
    snapshot().setLevelFilter("warn");
    snapshot().setCategoryFilter("gl");
    expect(snapshot().levelFilter).toBe("warn");
    expect(snapshot().categoryFilter).toBe("gl");
  });
});

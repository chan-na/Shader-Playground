import { beforeEach, describe, expect, it } from "vitest";
import { useDebugUiStore } from "./debugUiStore";

function snapshot() {
  return useDebugUiStore.getState();
}

describe("debugUiStore", () => {
  beforeEach(() => {
    const s = useDebugUiStore.getState();
    s.setOpen(false);
    s.setProblemsOpen(false);
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

  it("defaults problemsOpen to false", () => {
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("toggleProblems flips the problemsOpen flag", () => {
    snapshot().toggleProblems();
    expect(snapshot().problemsOpen).toBe(true);
    snapshot().toggleProblems();
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("setOpen(true) closes the problems overlay (mutual exclusion, R5)", () => {
    snapshot().setProblemsOpen(true);
    snapshot().setOpen(true);
    expect(snapshot().open).toBe(true);
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("toggleProblems() opening closes diagnostics (mutual exclusion, R5)", () => {
    snapshot().setOpen(true);
    snapshot().toggleProblems();
    expect(snapshot().problemsOpen).toBe(true);
    expect(snapshot().open).toBe(false);
  });

  it("setOpen(false) does not touch the problems overlay", () => {
    snapshot().setProblemsOpen(true);
    snapshot().setOpen(false);
    expect(snapshot().open).toBe(false);
    expect(snapshot().problemsOpen).toBe(true);
  });
});

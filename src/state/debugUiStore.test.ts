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
    s.setPassesOpen(false);
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

  // T1/D-1: passesOpen joins open/problemsOpen as a third mutually-exclusive
  // slot (design-request v2.3 AA1, interim decision — see debugUiStore.ts
  // header). Every combination below mirrors the pre-existing 2-way pairs
  // above rather than replacing them (those still guard the R5 contract).

  it("defaults passesOpen to false", () => {
    expect(snapshot().passesOpen).toBe(false);
  });

  it("togglePasses flips the passesOpen flag", () => {
    snapshot().togglePasses();
    expect(snapshot().passesOpen).toBe(true);
    snapshot().togglePasses();
    expect(snapshot().passesOpen).toBe(false);
  });

  it("setPassesOpen sets the flag directly", () => {
    snapshot().setPassesOpen(true);
    expect(snapshot().passesOpen).toBe(true);
  });

  it("setPassesOpen(true) closes diagnostics and problems (3-way exclusion)", () => {
    snapshot().setOpen(true);
    snapshot().setPassesOpen(true);
    expect(snapshot().passesOpen).toBe(true);
    expect(snapshot().open).toBe(false);
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("setOpen(true) closes passes in addition to problems (3-way exclusion)", () => {
    snapshot().setPassesOpen(true);
    snapshot().setOpen(true);
    expect(snapshot().open).toBe(true);
    expect(snapshot().passesOpen).toBe(false);
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("setProblemsOpen(true) closes passes in addition to diagnostics (3-way exclusion)", () => {
    snapshot().setPassesOpen(true);
    snapshot().setProblemsOpen(true);
    expect(snapshot().problemsOpen).toBe(true);
    expect(snapshot().passesOpen).toBe(false);
    expect(snapshot().open).toBe(false);
  });

  it("toggleOpen() opening closes both problems and passes", () => {
    snapshot().setPassesOpen(true);
    snapshot().toggleOpen();
    expect(snapshot().open).toBe(true);
    expect(snapshot().passesOpen).toBe(false);
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("toggleProblems() opening closes both diagnostics and passes", () => {
    snapshot().setPassesOpen(true);
    snapshot().toggleProblems();
    expect(snapshot().problemsOpen).toBe(true);
    expect(snapshot().passesOpen).toBe(false);
    expect(snapshot().open).toBe(false);
  });

  it("togglePasses() opening closes both diagnostics and problems", () => {
    snapshot().setOpen(true);
    snapshot().togglePasses();
    expect(snapshot().passesOpen).toBe(true);
    expect(snapshot().open).toBe(false);
    expect(snapshot().problemsOpen).toBe(false);
  });

  it("setPassesOpen(false) does not touch diagnostics or problems", () => {
    snapshot().setOpen(true);
    snapshot().setPassesOpen(true);
    snapshot().setPassesOpen(false);
    expect(snapshot().passesOpen).toBe(false);
    // Opening passes above already closed `open`; verify the *closing* call
    // itself doesn't resurrect either of the other two flags.
    expect(snapshot().open).toBe(false);
    expect(snapshot().problemsOpen).toBe(false);
  });
});

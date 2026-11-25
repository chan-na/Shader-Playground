import { beforeEach, describe, expect, it } from "vitest";
import { useHelpModalStore } from "./helpModalStore";

describe("useHelpModalStore", () => {
  beforeEach(() => {
    useHelpModalStore.getState().setOpen(false);
  });

  it("starts closed", () => {
    expect(useHelpModalStore.getState().open).toBe(false);
  });

  it("toggle flips open state", () => {
    useHelpModalStore.getState().toggle();
    expect(useHelpModalStore.getState().open).toBe(true);
    useHelpModalStore.getState().toggle();
    expect(useHelpModalStore.getState().open).toBe(false);
  });

  it("setOpen forces a specific value", () => {
    useHelpModalStore.getState().setOpen(true);
    expect(useHelpModalStore.getState().open).toBe(true);
    useHelpModalStore.getState().setOpen(false);
    expect(useHelpModalStore.getState().open).toBe(false);
  });
});

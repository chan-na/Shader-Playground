import { beforeEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "./commandPaletteStore";

const initial = useCommandPaletteStore.getState();

beforeEach(() => {
  useCommandPaletteStore.setState(initial, true);
});

describe("commandPaletteStore", () => {
  it("starts closed", () => {
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("setOpen(true/false) sets the flag directly", () => {
    useCommandPaletteStore.getState().setOpen(true);
    expect(useCommandPaletteStore.getState().open).toBe(true);
    useCommandPaletteStore.getState().setOpen(false);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("toggle() flips open on each call", () => {
    expect(useCommandPaletteStore.getState().open).toBe(false);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().open).toBe(true);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});

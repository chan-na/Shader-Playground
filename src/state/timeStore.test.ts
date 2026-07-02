import { beforeEach, describe, expect, it } from "vitest";
import { useTimeStore } from "./timeStore";

describe("timeStore", () => {
  beforeEach(() => {
    useTimeStore.getState().reset();
    useTimeStore.getState().setPlaying(true);
    useTimeStore.getState().setSpeed(1);
  });

  it("advances simTime when playing", () => {
    useTimeStore.getState().advance(0.05);
    expect(useTimeStore.getState().simTime).toBeCloseTo(0.05);
  });

  it("does not advance when paused", () => {
    useTimeStore.getState().setPlaying(false);
    useTimeStore.getState().advance(0.05);
    expect(useTimeStore.getState().simTime).toBe(0);
  });

  it("scales by speed", () => {
    useTimeStore.getState().setSpeed(2);
    useTimeStore.getState().advance(0.04);
    expect(useTimeStore.getState().simTime).toBeCloseTo(0.08);
  });

  it("clamps a huge dt so a background-tab/GC stall doesn't jump time (L14)", () => {
    // A 5-second stall must advance by at most the per-step cap (0.1s), not 5s.
    useTimeStore.getState().advance(5);
    expect(useTimeStore.getState().simTime).toBeCloseTo(0.1);
  });

  it("ignores negative dt (L14)", () => {
    useTimeStore.getState().advance(0.05);
    useTimeStore.getState().advance(-1);
    expect(useTimeStore.getState().simTime).toBeCloseTo(0.05);
  });

  it("togglePlaying flips state", () => {
    expect(useTimeStore.getState().playing).toBe(true);
    useTimeStore.getState().togglePlaying();
    expect(useTimeStore.getState().playing).toBe(false);
  });

  it("setTime clamps to >= 0", () => {
    useTimeStore.getState().setTime(-5);
    expect(useTimeStore.getState().simTime).toBe(0);
    useTimeStore.getState().setTime(12.5);
    expect(useTimeStore.getState().simTime).toBe(12.5);
  });

  it("user transitions bump rev so the RAF loop wakes from idle", () => {
    let r = useTimeStore.getState().rev;
    useTimeStore.getState().setPlaying(false);
    expect(useTimeStore.getState().rev).toBe(++r);
    useTimeStore.getState().togglePlaying();
    expect(useTimeStore.getState().rev).toBe(++r);
    useTimeStore.getState().setSpeed(2);
    expect(useTimeStore.getState().rev).toBe(++r);
    useTimeStore.getState().setTime(1.5);
    expect(useTimeStore.getState().rev).toBe(++r);
    useTimeStore.getState().reset();
    expect(useTimeStore.getState().rev).toBe(++r);
  });

  it("advance does not bump rev — the per-frame hot path stays quiet", () => {
    const before = useTimeStore.getState().rev;
    useTimeStore.getState().advance(0.016);
    expect(useTimeStore.getState().rev).toBe(before);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { useGpuTimerStore } from "./gpuTimerStore";

function snapshot() {
  return useGpuTimerStore.getState();
}

describe("gpuTimerStore", () => {
  beforeEach(() => {
    const s = useGpuTimerStore.getState();
    s.reset();
    s.setSupported(false);
    s.setEnabled(true);
  });

  it("seeds the first sample directly and EMA-smooths follow-ups", () => {
    const s = snapshot();
    s.setSample("n1", 10);
    expect(snapshot().byNode.n1).toBe(10);
    // EMA α=0.2 → 10 + (5 - 10) * 0.2 = 9
    s.setSample("n1", 5);
    expect(snapshot().byNode.n1).toBeCloseTo(9, 5);
  });

  it("recomputes totalMs across nodes on every sample", () => {
    const s = snapshot();
    s.setSample("a", 3);
    s.setSample("b", 7);
    expect(snapshot().totalMs).toBeCloseTo(10, 5);
    s.setSample("a", 13); // EMA → 3 + (13-3)*0.2 = 5
    expect(snapshot().byNode.a).toBeCloseTo(5, 5);
    expect(snapshot().totalMs).toBeCloseTo(12, 5);
  });

  it("removeNode drops the entry and adjusts totalMs", () => {
    const s = snapshot();
    s.setSample("a", 2);
    s.setSample("b", 4);
    s.removeNode("a");
    expect(snapshot().byNode).not.toHaveProperty("a");
    expect(snapshot().totalMs).toBeCloseTo(4, 5);
  });

  it("removeNode for an unknown id is a no-op", () => {
    const s = snapshot();
    s.setSample("a", 1);
    s.removeNode("nonexistent");
    expect(snapshot().byNode.a).toBe(1);
    expect(snapshot().totalMs).toBe(1);
  });

  it("setSupported(false) clears samples (context lost path)", () => {
    const s = snapshot();
    s.setSupported(true);
    s.setSample("a", 5);
    s.setSupported(false);
    const next = snapshot();
    expect(next.supported).toBe(false);
    expect(next.byNode).toEqual({});
    expect(next.totalMs).toBe(0);
  });

  it("setEnabled(false) clears samples but keeps supported", () => {
    const s = snapshot();
    s.setSupported(true);
    s.setSample("a", 5);
    s.setEnabled(false);
    const next = snapshot();
    expect(next.enabled).toBe(false);
    expect(next.supported).toBe(true);
    expect(next.byNode).toEqual({});
  });

  it("toggleEnabled flips between on/off and clears on disable", () => {
    const s = snapshot();
    s.setSupported(true);
    s.setSample("a", 5);
    expect(snapshot().enabled).toBe(true);
    s.toggleEnabled();
    expect(snapshot().enabled).toBe(false);
    expect(snapshot().byNode).toEqual({});
    s.toggleEnabled();
    expect(snapshot().enabled).toBe(true);
  });

  it("repeated setSupported(true) is idempotent", () => {
    const s = snapshot();
    s.setSupported(true);
    s.setSample("a", 5);
    s.setSupported(true);
    expect(snapshot().byNode.a).toBe(5);
  });
});

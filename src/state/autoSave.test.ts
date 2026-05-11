import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoSaveScheduler } from "./autoSave";
import type { SerializedProject } from "./serialization";

function makeFakeStore(initialRev = 0) {
  let rev = initialRev;
  const listeners = new Set<() => void>();
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  const bumpRev = () => {
    rev++;
    for (const cb of listeners) cb();
  };
  const payload = (): SerializedProject => ({
    format: "shader-playground",
    version: 1,
    exportedAt: new Date(0).toISOString(),
    graph: { nodes: [], edges: [] },
    positions: {},
  });
  return {
    getState: () => ({ rev, payload }),
    subscribe,
    bumpRev,
  };
}

describe("createAutoSaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save before the debounce window elapses", () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    store.bumpRev();
    vi.advanceTimersByTime(50);
    expect(persist).not.toHaveBeenCalled();
    handle.stop();
  });

  it("saves once after the debounce window elapses", async () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    store.bumpRev();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("coalesces rapid updates within the window into one save", async () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    store.bumpRev();
    vi.advanceTimersByTime(40);
    store.bumpRev();
    vi.advanceTimersByTime(40);
    store.bumpRev();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("does not save when the rev has not changed (initial bootstrap)", () => {
    const store = makeFakeStore(7);
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    // No change at all
    vi.advanceTimersByTime(1000);
    expect(persist).not.toHaveBeenCalled();
    handle.stop();
  });

  it("flush() forces a pending save to fire immediately", async () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 30_000,
    });
    store.bumpRev();
    await handle.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("updates lastSavedRev to the rev that was persisted", async () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    store.bumpRev();
    store.bumpRev();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(handle.lastSavedRev()).toBe(store.getState().rev);
    handle.stop();
  });

  it("stop() cancels a pending debounce", () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    store.bumpRev();
    handle.stop();
    vi.advanceTimersByTime(500);
    expect(persist).not.toHaveBeenCalled();
  });
});

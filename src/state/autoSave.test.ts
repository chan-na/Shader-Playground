import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  createAutoSaveScheduler,
  loadSession,
  startAutoSave,
  stopAutoSave,
} from "./autoSave";
import { useGraphStore } from "./graphStore";
import type { SerializedProject } from "./serialization";
import { useToastStore } from "./toastStore";

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

  it("persist rejection does not bubble out of the debounced fire-and-forget call", async () => {
    const store = makeFakeStore();
    const persist = vi.fn().mockRejectedValue(new Error("quota"));
    const handle = createAutoSaveScheduler({
      ...store,
      persist,
      delayMs: 100,
    });
    const onRejection = vi.fn();
    process.on("unhandledRejection", onRejection);
    try {
      store.bumpRev();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      expect(onRejection).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onRejection);
      handle.stop();
    }
  });
});

describe("startAutoSave unload listeners", () => {
  afterEach(() => {
    stopAutoSave();
  });

  it("attaches beforeunload and pagehide listeners", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    startAutoSave();
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("beforeunload");
    expect(events).toContain("pagehide");
    addSpy.mockRestore();
  });

  it("stopAutoSave detaches the unload listeners", () => {
    startAutoSave();
    const removeSpy = vi.spyOn(window, "removeEventListener");
    stopAutoSave();
    const events = removeSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("beforeunload");
    expect(events).toContain("pagehide");
    removeSpy.mockRestore();
  });

  it("dispatching beforeunload does not throw", () => {
    startAutoSave();
    // Bump rev so flush has something to do.
    useGraphStore.getState().reset();
    expect(() => window.dispatchEvent(new Event("beforeunload"))).not.toThrow();
  });

  it("dispatching pagehide does not throw (iOS Safari path)", () => {
    startAutoSave();
    useGraphStore.getState().reset();
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
  });

  it("startAutoSave is idempotent — second call returns the same handle", () => {
    const a = startAutoSave();
    const b = startAutoSave();
    expect(a).toBe(b);
  });
});

// ── IndexedDB integration via fake-indexeddb ──────────────────────────────

describe("loadSession / clearSession round-trip", () => {
  beforeEach(async () => {
    await clearSession();
  });

  it("loadSession returns null when nothing has been saved", async () => {
    expect(await loadSession()).toBeNull();
  });

  it("startAutoSave writes through to IndexedDB and loadSession reads it back", async () => {
    useGraphStore.getState().reset();
    const handle = startAutoSave();
    // Trigger a structural change so the scheduler queues a save.
    useGraphStore
      .getState()
      .addNode({ id: "persist-me", kind: "mesh", primitive: "cube" });
    await handle.flush();

    const restored = await loadSession();
    expect(restored).not.toBeNull();
    expect(restored?.format).toBe("shader-playground");
    expect(restored?.graph.nodes.some((n) => n.id === "persist-me")).toBe(true);

    stopAutoSave();
  });

  it("clearSession removes the persisted payload", async () => {
    useGraphStore.getState().reset();
    const handle = startAutoSave();
    useGraphStore
      .getState()
      .addNode({ id: "to-clear", kind: "mesh", primitive: "cube" });
    await handle.flush();
    expect(await loadSession()).not.toBeNull();

    await clearSession();
    expect(await loadSession()).toBeNull();
    stopAutoSave();
  });
});

describe("startAutoSave error surfacing", () => {
  afterEach(() => {
    stopAutoSave();
    useToastStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("toasts when persist throws and dedupes consecutive identical errors", async () => {
    useGraphStore.getState().reset();
    // openDb caches the DB promise at module scope, so spying on indexedDB.open
    // is too late once another test has warmed the cache. Patch put() instead —
    // it's called fresh on every saveSession.
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const handle = startAutoSave();
    useGraphStore
      .getState()
      .addNode({ id: "boom", kind: "mesh", primitive: "cube" });

    await expect(handle.flush()).rejects.toThrow();
    const errorsAfterFirst = useToastStore
      .getState()
      .toasts.filter((t) => t.kind === "error").length;
    expect(errorsAfterFirst).toBe(1);

    // Second failure with the SAME message should be deduped.
    useGraphStore
      .getState()
      .addNode({ id: "boom2", kind: "mesh", primitive: "cube" });
    await expect(handle.flush()).rejects.toThrow();
    const errorsAfterSecond = useToastStore
      .getState()
      .toasts.filter((t) => t.kind === "error").length;
    expect(errorsAfterSecond).toBe(1); // still one — dedup
  });
});

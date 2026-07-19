import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  createAutoSaveScheduler,
  loadSession,
  startAutoSave,
  startDockLayoutPersistence,
  stopAutoSave,
} from "./autoSave";
import { useDockStore } from "./dockStore";
import { createDefaultDockTree, type DockNode } from "./dockTree";
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

describe("loadSession failure handling", () => {
  it("returns null when the underlying IDB get rejects", async () => {
    // Spy on the prototype `get` so loadSession's catch branch fires.
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(() => {
        throw new Error("get failed");
      });
    try {
      expect(await loadSession()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("clearSession swallows IDB errors silently", async () => {
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "delete")
      .mockImplementation(() => {
        throw new Error("delete failed");
      });
    try {
      await expect(clearSession()).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
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

// ── Dock layout persistence (R9, B6-U1) ─────────────────────────────────────
// localStorage 키는 autoSave.ts 내부 프라이빗 상수라 여기서 문자열로 재선언한다
// (design/CHANGELOG.md §v1.4 R9 정본값과 동일 — autoSave.ts의 LAYOUT_KEY 참조).

const LAYOUT_KEY = "shader-playground.dock-layout";

describe("startDockLayoutPersistence — R9 (B6-U1)", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    useDockStore.setState({
      tree: createDefaultDockTree(),
      maximized: null,
      nextLeafId: 5,
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it("hydrates dockStore from a valid seeded snapshot", () => {
    const seededTree: DockNode = {
      type: "leaf",
      id: "l7",
      tabs: ["viewport"],
      active: "viewport",
    };
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        version: 2,
        tree: seededTree,
        maximized: null,
        nextLeafId: 8,
      }),
    );

    stop = startDockLayoutPersistence();

    expect(useDockStore.getState().tree).toEqual(seededTree);
    expect(useDockStore.getState().nextLeafId).toBe(8);
  });

  it("falls back to the default tree without throwing when the seed is broken JSON", () => {
    localStorage.setItem(LAYOUT_KEY, "{not json");
    const before = useDockStore.getState().tree;

    expect(() => {
      stop = startDockLayoutPersistence();
    }).not.toThrow();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("falls back to the default tree without throwing when the seed fails snapshot validation", () => {
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        version: 2,
        tree: { type: "leaf", id: "l1", tabs: ["bogus"], active: "bogus" },
        maximized: null,
        nextLeafId: 5,
      }),
    );
    const before = useDockStore.getState().tree;

    expect(() => {
      stop = startDockLayoutPersistence();
    }).not.toThrow();
    expect(useDockStore.getState().tree).toBe(before);
  });

  it("V4 (v2.0 quiet fallback): a version:1 (pre-v2.0 schema) snapshot is silently discarded — the v2.0 default tree is kept, no banner/throw", () => {
    // A well-formed *old* v1.x-shaped tree — the shape/leaf ids don't matter,
    // the version gate rejects it before the tree is ever inspected.
    const oldSchemaTree: DockNode = {
      type: "split",
      dir: "col",
      ratio: 0.717,
      a: {
        type: "split",
        dir: "row",
        ratio: 0.587,
        a: {
          type: "leaf",
          id: "l1",
          tabs: ["nodeEditor"],
          active: "nodeEditor",
        },
        b: {
          type: "split",
          dir: "col",
          ratio: 0.556,
          a: { type: "leaf", id: "l2", tabs: ["viewport"], active: "viewport" },
          b: {
            type: "leaf",
            id: "l3",
            tabs: ["inspector", "assets"],
            active: "inspector",
          },
        },
      },
      b: {
        type: "leaf",
        id: "l4",
        tabs: ["code"],
        active: "code",
        collapsed: false,
      },
    };
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        version: 1,
        tree: oldSchemaTree,
        maximized: null,
        nextLeafId: 5,
      }),
    );

    expect(() => {
      stop = startDockLayoutPersistence();
    }).not.toThrow();

    // no banner/warning surfaced — just a quiet fallback to the v2.0 default.
    expect(useDockStore.getState().tree).toEqual(createDefaultDockTree());
  });

  it("writes a snapshot to localStorage once the debounce window elapses after a store change", () => {
    vi.useFakeTimers();
    stop = startDockLayoutPersistence(100);
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();

    useDockStore.getState().closeTab("assets");
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull(); // debounced, not immediate
    vi.advanceTimersByTime(100);

    expect(localStorage.getItem(LAYOUT_KEY)).not.toBeNull();
  });

  it("coalesces rapid divider-drag-style changes into a single write (no per-pointermove write)", () => {
    vi.useFakeTimers();
    stop = startDockLayoutPersistence(100);
    // Spied on the instance (not `Storage.prototype`) — the jsdom-shadowing
    // localStorage polyfill in `test-setup.ts` isn't a `Storage` instance.
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    // ["b", "b"] is the viewport|inspector-assets col split in the v2.0
    // default tree (same fixture path used in dockTree.test.ts's
    // insertDetachedLeaf specs).
    for (let ratio = 0.3; ratio <= 0.6; ratio += 0.05) {
      useDockStore.getState().setDividerRatio(["b", "b"], ratio, 1000, 800);
      vi.advanceTimersByTime(10);
    }
    expect(setItemSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    setItemSpy.mockRestore();
  });

  it("stop() unsubscribes — a later store change no longer writes", () => {
    vi.useFakeTimers();
    stop = startDockLayoutPersistence(100);
    stop();
    stop = null;

    useDockStore.getState().closeTab("assets");
    vi.advanceTimersByTime(500);

    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });

  it("persists the snapshot in the {version, tree, maximized, nextLeafId} shape", () => {
    vi.useFakeTimers();
    stop = startDockLayoutPersistence(100);
    useDockStore.getState().closeTab("assets");
    vi.advanceTimersByTime(100);

    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === null) throw new Error("expected a persisted layout snapshot");
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed).sort()).toEqual(
      ["maximized", "nextLeafId", "tree", "version"].sort(),
    );
    expect(parsed).toEqual({
      version: 2,
      tree: useDockStore.getState().tree,
      maximized: useDockStore.getState().maximized,
      nextLeafId: useDockStore.getState().nextLeafId,
    });
  });
});

import { debounce } from "../utils/debounce";
import { log, normalizeError } from "../utils/log";
import { useGraphStore } from "./graphStore";
import { type SerializedProject, serializeProject } from "./serialization";
import { toast } from "./toastStore";

const DB_NAME = "shader-playground-session";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "autosave";

const AUTOSAVE_DEBOUNCE_MS = 30_000;

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function saveSession(payload: SerializedProject): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite").objectStore(STORE);
  await awaitRequest(tx.put(payload, KEY));
}

export async function loadSession(): Promise<SerializedProject | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly").objectStore(STORE);
    const v = await awaitRequest<SerializedProject | undefined>(tx.get(KEY));
    return v ?? null;
  } catch (e) {
    log.warn("autosave", "loadSession failed", normalizeError(e));
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE);
    await awaitRequest(tx.delete(KEY));
  } catch (e) {
    log.debug(
      "autosave",
      "clearSession failed (best-effort)",
      normalizeError(e),
    );
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────

interface AutoSaveDeps {
  /** Snapshot the current graph state. Defaults to graphStore. */
  getState: () => { rev: number; payload: () => SerializedProject };
  /** Subscribe to state changes. Defaults to graphStore.subscribe. */
  subscribe: (cb: () => void) => () => void;
  /** Persist the payload. Defaults to saveSession (IndexedDB). */
  persist: (p: SerializedProject) => Promise<void>;
  /** Debounce window in ms. Defaults to AUTOSAVE_DEBOUNCE_MS. */
  delayMs?: number;
}

export interface AutoSaveHandle {
  stop: () => void;
  /** Force-flush any pending save immediately (for tests / before unload). */
  flush: () => Promise<void>;
  /** Rev currently considered "saved" — exposed for tests. */
  lastSavedRev: () => number;
}

/**
 * Build a scheduler that watches store revs and debounces persistence.
 * Pure-logic shell — IndexedDB is injected via `persist` so tests can mock it.
 */
export function createAutoSaveScheduler(deps: AutoSaveDeps): AutoSaveHandle {
  const delay = deps.delayMs ?? AUTOSAVE_DEBOUNCE_MS;
  let lastSavedRev = deps.getState().rev;
  let pending = false;

  const flushNow = async () => {
    const { rev, payload } = deps.getState();
    if (rev === lastSavedRev) return;
    const data = payload();
    try {
      await deps.persist(data);
      lastSavedRev = rev;
    } finally {
      pending = false;
    }
  };

  const debounced = debounce(() => {
    flushNow().catch(() => {
      // Persist failures are surfaced by the injected `persist` callback
      // (e.g., toast on IndexedDB quota). Swallow here so the unhandled
      // rejection doesn't bubble out of fire-and-forget debounced calls.
    });
  }, delay);

  const unsub = deps.subscribe(() => {
    const { rev } = deps.getState();
    if (rev === lastSavedRev) return;
    pending = true;
    debounced();
  });

  return {
    stop: () => {
      debounced.cancel();
      unsub();
    },
    flush: async () => {
      debounced.cancel();
      if (pending) await flushNow();
    },
    lastSavedRev: () => lastSavedRev,
  };
}

let _activeHandle: AutoSaveHandle | null = null;
let _detachUnload: (() => void) | null = null;

/** Start auto-save against the global graphStore. Idempotent. */
export function startAutoSave(): AutoSaveHandle {
  if (_activeHandle) return _activeHandle;
  let lastErrorShown = "";
  const handle = createAutoSaveScheduler({
    getState: () => {
      const s = useGraphStore.getState();
      return {
        rev: s.rev,
        payload: () =>
          serializeProject(
            { nodes: s.nodes, edges: s.edges },
            s.positions,
            s.parents,
          ),
      };
    },
    subscribe: (cb) => useGraphStore.subscribe(cb),
    persist: async (p) => {
      try {
        await saveSession(p);
        lastErrorShown = "";
      } catch (err) {
        const msg = (err as Error).message || String(err);
        // De-dupe: quota errors repeat every debounce window — surface once
        // until a save eventually succeeds.
        if (msg !== lastErrorShown) {
          lastErrorShown = msg;
          toast.error(`자동 저장 실패: ${msg}`);
        }
        throw err;
      }
    },
  });
  _activeHandle = handle;
  _detachUnload = attachUnloadFlush(handle);
  return _activeHandle;
}

/**
 * Best-effort flush on tab close. `beforeunload` covers desktop refresh/close;
 * `pagehide` is the iOS Safari path (BFCache also gets a synchronous tick).
 * Both are fire-and-forget — IndexedDB may not finish if the browser is fast
 * to kill the page, but it cuts the worst-case 30 s debounce window down to
 * "whatever IDB can commit in the unload tick" for the common case.
 */
function attachUnloadFlush(handle: AutoSaveHandle): () => void {
  if (typeof window === "undefined") return () => {};
  const onUnload = () => {
    handle.flush().catch(() => {
      // Best-effort during page unload — nothing useful we can do if IDB
      // rejects, the page is going away. Swallow to avoid unhandled rejection.
    });
  };
  window.addEventListener("beforeunload", onUnload);
  window.addEventListener("pagehide", onUnload);
  return () => {
    window.removeEventListener("beforeunload", onUnload);
    window.removeEventListener("pagehide", onUnload);
  };
}

/** Stop the active scheduler (test seam). Detaches unload listeners too. */
export function stopAutoSave(): void {
  if (_detachUnload) {
    _detachUnload();
    _detachUnload = null;
  }
  if (_activeHandle) {
    _activeHandle.stop();
    _activeHandle = null;
  }
}

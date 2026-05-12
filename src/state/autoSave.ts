import { debounce } from "../utils/debounce";
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
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE);
    await awaitRequest(tx.delete(KEY));
  } catch {
    /* swallow — best-effort cleanup */
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

/** Start auto-save against the global graphStore. Idempotent. */
export function startAutoSave(): AutoSaveHandle {
  if (_activeHandle) return _activeHandle;
  let lastErrorShown = "";
  _activeHandle = createAutoSaveScheduler({
    getState: () => {
      const s = useGraphStore.getState();
      return {
        rev: s.rev,
        payload: () =>
          serializeProject({ nodes: s.nodes, edges: s.edges }, s.positions),
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
  return _activeHandle;
}

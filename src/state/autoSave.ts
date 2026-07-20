import { debounce } from "../utils/debounce";
import { log, normalizeError } from "../utils/log";
import { useDockStore } from "./dockStore";
import {
  type DockLayoutSnapshot,
  sanitizeDockLayoutSnapshot,
} from "./dockTree";
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

// ── Dock layout persistence (R9) ────────────────────────────────────────────
// 정본: `design/CHANGELOG.md` §v1.4 R9 — 도킹 레이아웃은 프로젝트 데이터가
// 아니라 "사용자 작업 환경"이므로 프로젝트 `.json`(`serialization.ts`)이
// 아닌 localStorage에 저장한다. 위의 IndexedDB 세션 오토세이브(그래프)와는
// 완전히 별개 저장소/스케줄러 — 서로 관여하지 않는다.

/** localStorage 키(모듈 프라이빗) — R9 레이아웃 스냅샷 전용. */
const LAYOUT_KEY = "shader-playground.dock-layout";

/** divider 드래그는 pointermove마다 `setDividerRatio`를 호출해 `dockStore`를
 * 갱신하므로, 구독 콜백에서 바로 저장하면 매 프레임 localStorage에 쓰게
 * 된다 — 디바운스 필수. */
const LAYOUT_SAVE_DEBOUNCE_MS = 500;

/** localStorage에서 레이아웃 스냅샷을 읽어 검증한다. 어떤 실패
 * 경로(SSR/구버전 브라우저의 `localStorage` 부재, 손상된 JSON, 스키마
 * 불일치)에서도 절대 throw하지 않고 `null`을 반환한다 — 호출측이 조용히
 * 기본 트리를 유지하게 하기 위함(R9). */
function loadDockLayout(): DockLayoutSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === null) return null;
    return sanitizeDockLayoutSnapshot(JSON.parse(raw));
  } catch (e) {
    log.warn("autosave", "loadDockLayout failed", normalizeError(e));
    return null;
  }
}

/** 현재 `dockStore` 상태를 스냅샷으로 직렬화해 localStorage에 쓴다.
 * best-effort — 쿼터 초과 등으로 실패해도 throw하지 않는다(레이아웃
 * 영속화 실패는 그래프 오토세이브와 달리 데이터 손실이 아니므로 토스트도
 * 띄우지 않는다). */
function saveDockLayout(): void {
  try {
    const { tree, maximized, nextLeafId } = useDockStore.getState();
    const snapshot: DockLayoutSnapshot = {
      version: 2,
      tree,
      maximized,
      nextLeafId,
    };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(snapshot));
  } catch (e) {
    log.debug(
      "autosave",
      "saveDockLayout failed (best-effort)",
      normalizeError(e),
    );
  }
}

/**
 * 도킹 레이아웃 영속화를 시작한다(R9) — 저장된 스냅샷이 있으면 즉시
 * `dockStore`를 하이드레이션하고, 이후 변경을 디바운스해 localStorage에
 * 반영한다. `main.tsx`가 `createRoot` 렌더 **전**에 1회 호출해야 한다(기본
 * 트리 → 저장된 트리로 바뀌는 첫 프레임 플래시를 막기 위함).
 *
 * `startAutoSave`(그래프, IndexedDB)와 별개다 — 그쪽은 세션 복구
 * 다이얼로그 수명주기에 묶여 조건부로 시작하지만, 레이아웃은 항상
 * 무조건·즉시 복원한다.
 *
 * 반환값은 구독 해제 + `pagehide`/`beforeunload` 리스너 해제 +
 * 디바운스 취소를 한 번에 수행하는 stop 함수(테스트 정리용).
 */
export function startDockLayoutPersistence(delayMs?: number): () => void {
  const saved = loadDockLayout();
  if (saved !== null) {
    useDockStore.setState({
      tree: saved.tree,
      maximized: saved.maximized,
      nextLeafId: saved.nextLeafId,
    });
  }

  const debounced = debounce(
    saveDockLayout,
    delayMs ?? LAYOUT_SAVE_DEBOUNCE_MS,
  );
  const unsub = useDockStore.subscribe(debounced);

  const onUnload = () => {
    debounced.cancel();
    saveDockLayout();
  };
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) {
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
  }

  return () => {
    unsub();
    debounced.cancel();
    if (hasWindow) {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    }
  };
}

// fake-indexeddb shim — jsdom omits IndexedDB; auto-import installs an in-memory
// IDBFactory on globalThis so cache.ts / autoSave.ts IDB paths are testable.
import "fake-indexeddb/auto";
import { setMinLevel } from "./utils/log";

// Keep the dev logger's console mirroring quiet under tests — the P3 catch-site
// traces would otherwise flood test output. The buffer still records every
// entry, so tests asserting log behavior are unaffected (log.test.ts sets its
// own level).
setMinLevel("error");

// Minimal ImageData polyfill for jsdom (which omits the Canvas/ImageData APIs).
if (typeof globalThis.ImageData === "undefined") {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: "srgb" = "srgb";
    constructor(arg1: Uint8ClampedArray | number, arg2: number, arg3?: number) {
      if (arg1 instanceof Uint8ClampedArray) {
        this.data = arg1;
        this.width = arg2;
        this.height = arg3 ?? arg1.length / 4 / arg2;
      } else {
        this.width = arg1;
        this.height = arg2;
        this.data = new Uint8ClampedArray(arg1 * arg2 * 4);
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData =
    ImageDataPolyfill;
}

// Node 22+ ships an experimental global `localStorage` accessor that returns
// `undefined` unless the process is started with `--localstorage-file`
// (Node's webstorage feature) — and under vitest-environment-jsdom,
// `window === globalThis`, so this accessor shadows jsdom's own Storage
// implementation entirely (`window.localStorage` resolves to the same
// non-functional accessor, not jsdom's). Replace it with a small
// spec-compatible in-memory Storage so tests that exercise real localStorage
// (R9 dock layout persistence, `src/state/autoSave.test.ts`) observe the same
// behavior as a real browser. `.nvmrc` pins Node 22 — CI hits this too, it's
// not a sandbox-only quirk.
if (typeof globalThis.localStorage === "undefined") {
  class MemoryStorage implements Storage {
    #data = new Map<string, string>();

    get length(): number {
      return this.#data.size;
    }

    clear(): void {
      this.#data.clear();
    }

    getItem(key: string): string | null {
      return this.#data.get(key) ?? null;
    }

    key(index: number): string | null {
      return [...this.#data.keys()][index] ?? null;
    }

    removeItem(key: string): void {
      this.#data.delete(key);
    }

    setItem(key: string, value: string): void {
      this.#data.set(key, String(value));
    }
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

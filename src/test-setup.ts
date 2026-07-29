// fake-indexeddb shim — jsdom omits IndexedDB; auto-import installs an in-memory
// IDBFactory on globalThis so cache.ts / autoSave.ts IDB paths are testable.
import "fake-indexeddb/auto";
import { setMinLevel } from "./utils/log";

// Keep the dev logger's console mirroring quiet under tests — the P3 catch-site
// traces would otherwise flood test output. The buffer still records every
// entry, so tests asserting log behavior are unaffected (log.test.ts sets its
// own level).
setMinLevel("error");

// `Range.prototype.getClientRects` polyfill — jsdom implements it on Element
// but not on Range (see jsdom's Element-impl.js vs its Range impl). CodeMirror's
// `clientRectsFor()` calls it on a text-node range from inside its rAF measure
// loop (`DocView.measureTextSize`), so any test that mounts a real EditorView
// and then lets a frame run throws an *unhandled* TypeError that vitest fails
// the whole file on. An empty list is the honest answer under jsdom's zero-size
// layout model, and CodeMirror already handles it (`rect && rect.width ? … : 7`
// falls back to its default char width / line height).
if (typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    const rects: DOMRect[] = [];
    return Object.assign(rects, {
      item: (i: number): DOMRect | null => rects[i] ?? null,
    });
  };
}

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

// Node 22+ ships an experimental global `localStorage` accessor (Node's
// webstorage feature). Without `--localstorage-file` it is non-functional, and
// — critically — its behavior differs by Node version: on some versions the
// accessor is present but returns a fresh object per access, so a test's
// `vi.spyOn(localStorage, "setItem")` wraps a *different* instance than the one
// `saveDockLayout()` writes through, and the spy observes zero calls (this bit
// CI on Node 22 while passing locally on Node 26). Under vitest-jsdom
// `window === globalThis`, so this global also shadows jsdom's own Storage.
//
// So we install a small spec-compatible in-memory Storage *unconditionally* —
// a version-sniffing guard (`typeof globalThis.localStorage === "undefined"`)
// is exactly what made this fragile. Tests that exercise real localStorage (R9
// dock layout persistence, `src/state/autoSave.test.ts`) then always see one
// stable instance, matching a real browser. `.nvmrc` pins Node 22.
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
// Install unless a non-configurable `localStorage` already exists (Node's
// experimental global is configurable, so this replaces it; the guard only
// avoids a throw in the theoretical case it isn't).
{
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (!desc || desc.configurable) {
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

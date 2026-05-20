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

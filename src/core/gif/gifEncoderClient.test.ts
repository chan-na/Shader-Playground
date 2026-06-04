import { describe, expect, it } from "vitest";
import {
  type GifEncodeJob,
  GifEncoderClient,
  gifEncoder,
} from "./gifEncoderClient";

/**
 * Minimal Worker stand-in. The real ?worker bundle never runs in vitest
 * (jsdom has no Worker), so each test injects `new GifEncoderClient({
 * workerFactory })` with a FakeWorker to drive responses synchronously and
 * observe the client's routing + fallback behaviour. A custom factory bypasses
 * the `typeof Worker` guard, so the worker path is exercised even in jsdom.
 */
class FakeWorker {
  readonly sent: unknown[] = [];
  postShouldThrow = false;
  terminateCount = 0;
  private msgListeners: ((ev: MessageEvent) => void)[] = [];
  private errListeners: ((ev: Event) => void)[] = [];

  postMessage(data: unknown) {
    if (this.postShouldThrow) throw new Error("postMessage failed");
    this.sent.push(data);
  }
  addEventListener(type: string, cb: (ev: Event) => void) {
    if (type === "message")
      this.msgListeners.push(cb as (ev: MessageEvent) => void);
    else if (type === "error") this.errListeners.push(cb);
  }
  terminate() {
    this.terminateCount += 1;
  }

  // Test-only helpers ----------------------------------------------------
  reply(data: unknown) {
    const ev = { data } as MessageEvent;
    for (const cb of this.msgListeners) cb(ev);
  }
  fireError(message = "worker exploded") {
    const ev =
      typeof ErrorEvent !== "undefined"
        ? new ErrorEvent("error", { message })
        : (new Event("error") as Event);
    for (const cb of this.errListeners) cb(ev);
  }
}

function makeClient(): { c: GifEncoderClient; w: FakeWorker } {
  const w = new FakeWorker();
  const c = new GifEncoderClient({
    workerFactory: () => w as unknown as Worker,
  });
  return { c, w };
}

function solidJob(): GifEncodeJob {
  const rgba = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    rgba[i * 4] = 10;
    rgba[i * 4 + 1] = 20;
    rgba[i * 4 + 2] = 30;
    rgba[i * 4 + 3] = 255;
  }
  return {
    width: 2,
    height: 2,
    frames: [{ rgba, delayMs: 100 }],
    maxColors: 256,
    loop: true,
  };
}

function isGif89a(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 6))) === "GIF89a";
}

function sentReqId(w: FakeWorker, index: number): number {
  const msg = w.sent[index] as { reqId?: number } | undefined;
  if (!msg || typeof msg.reqId !== "number") {
    throw new Error(`no request posted at index ${index}`);
  }
  return msg.reqId;
}

describe("GifEncoderClient", () => {
  it("posts a structured request and resolves with the worker's bytes", async () => {
    const { c, w } = makeClient();
    const p = c.encode(solidJob());
    expect(w.sent).toHaveLength(1);
    const msg = w.sent[0] as { type: string; width: number; loop: boolean };
    expect(msg.type).toBe("encode");
    expect(msg.width).toBe(2);
    expect(msg.loop).toBe(true);

    const payload = new Uint8Array([7, 8, 9]);
    w.reply({
      type: "encode",
      reqId: sentReqId(w, 0),
      ok: true,
      bytes: payload,
    });
    await expect(p).resolves.toEqual(payload);
  });

  it("rejects when the worker reports an encode error", async () => {
    const { c, w } = makeClient();
    const p = c.encode(solidJob());
    w.reply({
      type: "encode",
      reqId: sentReqId(w, 0),
      ok: false,
      error: "bad dimensions",
    });
    await expect(p).rejects.toThrow("bad dimensions");
  });

  it("routes out-of-order replies by reqId", async () => {
    const { c, w } = makeClient();
    const p1 = c.encode(solidJob());
    const p2 = c.encode(solidJob());
    const b1 = new Uint8Array([1]);
    const b2 = new Uint8Array([2]);
    // Reply to the second first.
    w.reply({ type: "encode", reqId: sentReqId(w, 1), ok: true, bytes: b2 });
    w.reply({ type: "encode", reqId: sentReqId(w, 0), ok: true, bytes: b1 });
    await expect(p1).resolves.toEqual(b1);
    await expect(p2).resolves.toEqual(b2);
  });

  it("ignores malformed and stray replies", async () => {
    const { c, w } = makeClient();
    const p = c.encode(solidJob());
    // Wrong type, then unknown reqId — neither must settle the pending promise.
    expect(() => w.reply({ type: "other" })).not.toThrow();
    expect(() =>
      w.reply({
        type: "encode",
        reqId: 999,
        ok: true,
        bytes: new Uint8Array(),
      }),
    ).not.toThrow();
    const payload = new Uint8Array([42]);
    w.reply({
      type: "encode",
      reqId: sentReqId(w, 0),
      ok: true,
      bytes: payload,
    });
    await expect(p).resolves.toEqual(payload);
  });

  it("falls back to an inline encode when worker construction throws", async () => {
    const c = new GifEncoderClient({
      workerFactory: () => {
        throw new Error("no worker here");
      },
    });
    const bytes = await c.encode(solidJob());
    expect(isGif89a(bytes)).toBe(true);
  });

  it("propagates an inline encode error when the input is invalid", async () => {
    const c = new GifEncoderClient({
      workerFactory: () => {
        throw new Error("no worker here");
      },
    });
    await expect(
      c.encode({ width: 0, height: 2, frames: [], maxColors: 256, loop: true }),
    ).rejects.toThrow();
  });

  it("falls back to an inline encode when postMessage throws", async () => {
    const { c, w } = makeClient();
    w.postShouldThrow = true;
    const bytes = await c.encode(solidJob());
    expect(isGif89a(bytes)).toBe(true);
    expect(w.sent).toHaveLength(0);
  });

  it("drains pending jobs inline on a worker error event", async () => {
    const { c, w } = makeClient();
    const p = c.encode(solidJob());
    w.fireError("crashed mid-encode");
    const bytes = await p;
    expect(isGif89a(bytes)).toBe(true);
    expect(w.terminateCount).toBe(1);
  });

  it("dispose() rejects in-flight jobs and terminates the worker", async () => {
    const { c, w } = makeClient();
    const p = c.encode(solidJob());
    c.dispose();
    expect(w.terminateCount).toBe(1);
    await expect(p).rejects.toThrow(/disposed/);
  });

  it("gifEncoder() returns a stable singleton", () => {
    expect(gifEncoder()).toBe(gifEncoder());
  });
});

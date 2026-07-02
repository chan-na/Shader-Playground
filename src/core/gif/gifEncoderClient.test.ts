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

  it("forwards worker progress messages to job.onProgress", async () => {
    const { c, w } = makeClient();
    const progress: Array<[number, number]> = [];
    const p = c.encode({
      ...solidJob(),
      onProgress: (done, total) => progress.push([done, total]),
    });
    const reqId = sentReqId(w, 0);
    w.reply({ type: "progress", reqId, done: 1, total: 3 });
    w.reply({ type: "progress", reqId, done: 2, total: 3 });
    w.reply({ type: "progress", reqId, done: 3, total: 3 });
    // Progress must not settle the promise — the job stays pending.
    const payload = new Uint8Array([1, 2, 3]);
    w.reply({ type: "encode", reqId, ok: true, bytes: payload });
    await expect(p).resolves.toEqual(payload);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("keeps reported progress monotonic across a worker→inline fallback (L11)", async () => {
    const { c, w } = makeClient();
    const done: number[] = [];
    const frame = () => {
      const rgba = new Uint8Array(2 * 2 * 4);
      rgba.fill(255);
      return { rgba, delayMs: 100 };
    };
    const p = c.encode({
      width: 2,
      height: 2,
      maxColors: 256,
      loop: true,
      frames: [frame(), frame(), frame(), frame()],
      onProgress: (d) => done.push(d),
    });
    const reqId = sentReqId(w, 0);
    // Worker makes real headway…
    w.reply({ type: "progress", reqId, done: 1, total: 4 });
    w.reply({ type: "progress", reqId, done: 2, total: 4 });
    // …then dies → inline fallback restarts the encode from frame 0.
    w.fireError("crashed mid-encode");
    await p;
    // The inline restart reports 0,1,… but the guard suppresses anything below
    // the worker's high-water mark, so progress never jumps backward.
    expect(done.length).toBeGreaterThan(0);
    for (let i = 1; i < done.length; i++) {
      expect(done[i]!).toBeGreaterThanOrEqual(done[i - 1]!);
    }
    expect(Math.min(...done)).toBeGreaterThanOrEqual(1);
  });

  it("ignores progress for an unknown reqId", async () => {
    const { c, w } = makeClient();
    const progress: number[] = [];
    const p = c.encode({
      ...solidJob(),
      onProgress: (done) => progress.push(done),
    });
    expect(() =>
      w.reply({ type: "progress", reqId: 999, done: 1, total: 1 }),
    ).not.toThrow();
    w.reply({
      type: "encode",
      reqId: sentReqId(w, 0),
      ok: true,
      bytes: new Uint8Array([0]),
    });
    await p;
    expect(progress).toEqual([]);
  });

  it("reports progress through the inline fallback path", async () => {
    const c = new GifEncoderClient({
      workerFactory: () => {
        throw new Error("no worker here");
      },
    });
    const progress: Array<[number, number]> = [];
    const bytes = await c.encode({
      ...solidJob(),
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(isGif89a(bytes)).toBe(true);
    expect(progress).toEqual([[1, 1]]);
  });

  it("gifEncoder() returns a stable singleton", () => {
    expect(gifEncoder()).toBe(gifEncoder());
  });
});

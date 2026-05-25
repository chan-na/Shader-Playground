import { describe, expect, it } from "vitest";
import { GlslValidator } from "./glslValidator";

/**
 * Minimal Worker stand-in. We never spin up the real ?worker bundle in
 * vitest (jsdom has no Worker, no OffscreenCanvas) — instead each test
 * constructs `new GlslValidator({ workerFactory })` with a FakeWorker so we
 * can poke responses synchronously and observe the client behaviour.
 */
class FakeWorker {
  readonly sent: unknown[] = [];
  postShouldThrow = false;
  private msgListeners: ((ev: MessageEvent) => void)[] = [];
  private errListeners: ((ev: Event) => void)[] = [];
  terminateCount = 0;

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

function makeValidator(): { v: GlslValidator; w: FakeWorker } {
  const w = new FakeWorker();
  const v = new GlslValidator({ workerFactory: () => w as unknown as Worker });
  return { v, w };
}

describe("GlslValidator", () => {
  it("posts a structured request and resolves with parsed diagnostics", async () => {
    const { v, w } = makeValidator();
    const promise = v.validate("fragment", "// source");
    expect(w.sent).toHaveLength(1);
    const sent = w.sent[0] as {
      type: string;
      reqId: number;
      stage: string;
      source: string;
    };
    expect(sent.type).toBe("validate");
    expect(sent.reqId).toBe(1);
    expect(sent.stage).toBe("fragment");
    expect(sent.source).toBe("// source");

    w.reply({
      type: "validate",
      reqId: sent.reqId,
      log: "ERROR: 0:7: 'foo' : undeclared identifier",
      ok: false,
    });
    const diags = await promise;
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      line: 7,
      severity: "error",
      message: "'foo' : undeclared identifier",
    });
  });

  it("resolves with [] when the worker info log is empty (clean compile)", async () => {
    const { v, w } = makeValidator();
    const p = v.validate("vertex", "");
    w.reply({ type: "validate", reqId: 1, log: "", ok: true });
    expect(await p).toEqual([]);
  });

  it("routes responses by reqId — out-of-order replies still resolve correctly", async () => {
    const { v, w } = makeValidator();
    const p1 = v.validate("fragment", "a");
    const p2 = v.validate("fragment", "b");
    // Reply to the second first.
    w.reply({
      type: "validate",
      reqId: 2,
      log: "ERROR: 0:2: 'b' : ...",
      ok: false,
    });
    w.reply({
      type: "validate",
      reqId: 1,
      log: "ERROR: 0:1: 'a' : ...",
      ok: false,
    });
    const [d1, d2] = await Promise.all([p1, p2]);
    expect(d1[0]?.line).toBe(1);
    expect(d2[0]?.line).toBe(2);
  });

  it("ignores stray responses with unknown reqId", async () => {
    const { v: _v, w } = makeValidator();
    // No outstanding requests — must not throw.
    expect(() =>
      w.reply({ type: "validate", reqId: 999, log: "", ok: true }),
    ).not.toThrow();
  });

  it("resolves with [] and does not enqueue when postMessage throws", async () => {
    const { v, w } = makeValidator();
    w.postShouldThrow = true;
    const diags = await v.validate("fragment", "x");
    expect(diags).toEqual([]);
    expect(w.sent).toHaveLength(0);
  });

  it("falls back to [] when the worker factory throws (permanent fail flag)", async () => {
    const v = new GlslValidator({
      workerFactory: () => {
        throw new Error("nope");
      },
    });
    expect(await v.validate("fragment", "x")).toEqual([]);
    // Subsequent calls also resolve with [] without retrying construction.
    expect(await v.validate("fragment", "y")).toEqual([]);
  });

  it("dispose() terminates the worker and drains pending promises with []", async () => {
    const { v, w } = makeValidator();
    const p = v.validate("fragment", "x");
    v.dispose();
    expect(w.terminateCount).toBe(1);
    expect(await p).toEqual([]);
  });

  it("on worker error: drains pending with [] and marks failed", async () => {
    const { v, w } = makeValidator();
    const p = v.validate("fragment", "x");
    w.fireError("oops");
    expect(await p).toEqual([]);
    // New validate after error stays failed and resolves with [].
    expect(await v.validate("fragment", "y")).toEqual([]);
  });
});

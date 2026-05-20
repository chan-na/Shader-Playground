import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogBuffer,
  exportLogText,
  getLogBuffer,
  log,
  normalizeError,
  setMinLevel,
  subscribeLog,
} from "./log";

describe("log", () => {
  beforeEach(() => {
    clearLogBuffer();
    setMinLevel("debug");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores entries in the buffer regardless of level", () => {
    log.debug("app", "d");
    log.info("app", "i");
    log.warn("app", "w");
    log.error("app", "e");
    const buf = getLogBuffer();
    expect(buf.map((e) => e.level)).toEqual(["debug", "info", "warn", "error"]);
    expect(buf.map((e) => e.message)).toEqual(["d", "i", "w", "e"]);
  });

  it("attaches category and detail when provided", () => {
    log.warn("assets", "load failed", { url: "x.png" });
    const entry = getLogBuffer()[0];
    expect(entry?.category).toBe("assets");
    expect(entry?.detail).toEqual({ url: "x.png" });
  });

  it("omits detail key when not provided (exactOptionalPropertyTypes)", () => {
    log.info("app", "no detail");
    const entry = getLogBuffer()[0];
    expect(entry && "detail" in entry).toBe(false);
  });

  it("evicts oldest entries past the ring capacity (500)", () => {
    for (let i = 0; i < 520; i++) log.debug("app", `m${i}`);
    const buf = getLogBuffer();
    expect(buf.length).toBe(500);
    expect(buf[0]?.message).toBe("m20");
    expect(buf[buf.length - 1]?.message).toBe("m519");
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const fn = vi.fn();
    const off = subscribeLog(fn);
    log.info("app", "first");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    log.info("app", "second");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clearLogBuffer empties the buffer", () => {
    log.info("app", "x");
    expect(getLogBuffer().length).toBe(1);
    clearLogBuffer();
    expect(getLogBuffer().length).toBe(0);
  });

  it("mirrors to console only at or above minLevel (DEV)", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setMinLevel("error");
    log.debug("app", "quiet");
    log.error("app", "loud");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // 버퍼엔 레벨과 무관하게 둘 다 저장된다.
    expect(getLogBuffer().length).toBe(2);
  });

  it("exportLogText formats entries with iso ts, level, category, message", () => {
    log.warn("gl", "link failed");
    const text = exportLogText();
    expect(text).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*Z\] WARN gl: link failed$/);
  });

  it("exportLogText appends serialized detail on a new line", () => {
    log.error("render", "boom", { code: 1280 });
    expect(exportLogText()).toContain('\n  {"code":1280}');
  });

  it("normalizeError flattens Error to name/message/stack", () => {
    const norm = normalizeError(new TypeError("nope")) as {
      name: string;
      message: string;
      stack?: string;
    };
    expect(norm.name).toBe("TypeError");
    expect(norm.message).toBe("nope");
    expect(typeof norm.stack).toBe("string");
  });

  it("normalizeError passes through non-Error values", () => {
    expect(normalizeError("plain")).toBe("plain");
    expect(normalizeError(42)).toBe(42);
  });
});

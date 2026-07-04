import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid calls into a single trailing call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("cancel prevents the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush fires the pending call immediately with the latest args", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d(2);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it("flush does not double-fire when the timer would have elapsed", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d.flush();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush is a no-op when nothing is pending", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
    // A prior fire clears the pending state, so a later flush is also inert.
    d(1);
    vi.advanceTimersByTime(50);
    fn.mockClear();
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel after flush leaves nothing to fire", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d.flush();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

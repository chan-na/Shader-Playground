import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, useToastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("push appends a toast with default kind info", () => {
    useToastStore.getState().push({ message: "hello" });
    const ts = useToastStore.getState().toasts;
    expect(ts).toHaveLength(1);
    expect(ts[0]?.kind).toBe("info");
    expect(ts[0]?.message).toBe("hello");
  });

  it("push returns a unique id per toast", () => {
    const a = useToastStore.getState().push({ message: "a" });
    const b = useToastStore.getState().push({ message: "b" });
    expect(a).not.toBe(b);
  });

  it("auto-dismisses after the default duration for the kind", () => {
    toast.success("done");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(2999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("durationMs: 0 disables auto-dismiss", () => {
    useToastStore
      .getState()
      .push({ kind: "error", message: "stay", durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("explicit durationMs overrides the kind default", () => {
    useToastStore
      .getState()
      .push({ kind: "info", message: "quick", durationMs: 100 });
    vi.advanceTimersByTime(99);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("dismiss removes only the matching toast", () => {
    const a = useToastStore.getState().push({ message: "a", durationMs: 0 });
    const b = useToastStore.getState().push({ message: "b", durationMs: 0 });
    useToastStore.getState().dismiss(a);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(b);
  });

  it("clear empties the toast list", () => {
    useToastStore.getState().push({ message: "a", durationMs: 0 });
    useToastStore.getState().push({ message: "b", durationMs: 0 });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("error kind uses the longer default duration", () => {
    toast.error("boom");
    vi.advanceTimersByTime(7999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("toast.info wrapper pushes an info toast and respects explicit duration", () => {
    toast.info("hello");
    const after = useToastStore.getState().toasts;
    expect(after[after.length - 1]?.kind).toBe("info");
    useToastStore.getState().clear();

    toast.info("brief", 50);
    vi.advanceTimersByTime(49);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("toast.warning wrapper pushes a warning toast and respects explicit duration", () => {
    toast.warning("careful");
    const after = useToastStore.getState().toasts;
    expect(after[after.length - 1]?.kind).toBe("warning");
    useToastStore.getState().clear();

    toast.warning("quick", 25);
    vi.advanceTimersByTime(24);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("toast.success and toast.error accept explicit durations", () => {
    toast.success("yay", 10);
    toast.error("oh no", 20);
    expect(useToastStore.getState().toasts.map((t) => t.kind)).toEqual([
      "success",
      "error",
    ]);
    vi.advanceTimersByTime(10);
    expect(useToastStore.getState().toasts.map((t) => t.kind)).toEqual([
      "error",
    ]);
    vi.advanceTimersByTime(10);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

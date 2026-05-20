import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogBuffer, getLogBuffer } from "../utils/log";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  beforeEach(() => clearLogBuffer());
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no error", () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <span data-testid="child">ok</span>
      </ErrorBoundary>,
    );
    expect(html).toContain('data-testid="child"');
    expect(html).not.toContain('data-testid="error-boundary-fallback"');
  });

  it("getDerivedStateFromError stores the error", () => {
    const err = new Error("boom");
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({
      error: err,
    });
  });

  it("renders the recovery fallback once in the error state", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { error: new Error("boom") };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain('data-testid="error-boundary-fallback"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="error-boundary-reload"');
    expect(html).toContain('data-testid="error-boundary-copy"');
    expect(html).toContain("문제가 발생했습니다");
  });

  it("componentDidCatch logs the error with component stack", () => {
    const boundary = new ErrorBoundary({ children: null });
    const err = new TypeError("nope");
    boundary.componentDidCatch(err, {
      componentStack: "\n  at Foo",
    });
    const entries = getLogBuffer();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.level).toBe("error");
    expect(entry?.category).toBe("app");
    const detail = entry?.detail as {
      error: { name: string; message: string };
      componentStack: string;
    };
    expect(detail.error.name).toBe("TypeError");
    expect(detail.error.message).toBe("nope");
    expect(detail.componentStack).toContain("at Foo");
  });
});

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "../theme";
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
    expect(html).toContain("Something went wrong");
  });

  it("is token/webfont-independent by design (D6) — no modal-scrim/modal-card classes", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { error: new Error("boom") };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).not.toContain("modal-scrim");
    expect(html).not.toContain("modal-card");
    expect(html).toContain("#111214");
    expect(html).toContain("system-ui");
    expect(html).toContain("no theme tokens or web fonts required");
  });

  it("Reload CTA background uses tokens.accent.default (the one intentional token reference)", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { error: new Error("boom") };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain(tokens.accent.default);
  });

  it("shows the first lines of the error stack when present", () => {
    const boundary = new ErrorBoundary({ children: null });
    const err = new Error("stacked boom");
    err.stack =
      "Error: stacked boom\n    at Foo (foo.ts:1)\n    at Bar (bar.ts:2)";
    boundary.state = { error: err };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain("Error: stacked boom");
    expect(html).toContain("at Foo (foo.ts:1)");
  });

  it("falls back to name: message when the error has no stack", () => {
    const boundary = new ErrorBoundary({ children: null });
    const err = new Error("boom");
    err.stack = "";
    boundary.state = { error: err };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain("Error: boom");
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

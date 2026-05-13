import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Toast, ToastKind } from "../state/toastStore";
import { ToastRow } from "./ToastRow";

function makeToast(kind: ToastKind, message = "hello"): Toast {
  return { id: `t-${kind}`, kind, message, durationMs: 4000 };
}

describe("ToastRow", () => {
  it("renders message and dismiss button with aria-label", () => {
    const html = renderToStaticMarkup(
      <ToastRow toast={makeToast("info")} onDismiss={vi.fn()} />,
    );
    expect(html).toContain("hello");
    expect(html).toContain('aria-label="Dismiss notification"');
    expect(html).toContain('role="status"');
  });

  it("marks the icon and dismiss glyph as decorative (aria-hidden)", () => {
    const html = renderToStaticMarkup(
      <ToastRow toast={makeToast("error")} onDismiss={vi.fn()} />,
    );
    // Two aria-hidden spans: icon + ✕ dismiss glyph
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
  });

  it.each<[ToastKind, string]>([
    ["info", "ℹ"],
    ["success", "✓"],
    ["warning", "⚠"],
    ["error", "✕"],
  ])("uses the %s icon glyph", (kind, glyph) => {
    const html = renderToStaticMarkup(
      <ToastRow toast={makeToast(kind)} onDismiss={vi.fn()} />,
    );
    expect(html).toContain(glyph);
    expect(html).toContain(`data-kind="${kind}"`);
  });

  it("preserves whitespace in long messages (pre-wrap)", () => {
    const html = renderToStaticMarkup(
      <ToastRow
        toast={makeToast("warning", "line1\nline2")}
        onDismiss={vi.fn()}
      />,
    );
    expect(html).toContain("white-space:pre-wrap");
    expect(html).toContain("line1");
    expect(html).toContain("line2");
  });
});

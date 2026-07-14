import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecoveryDialog, swallowEscape } from "./RecoveryDialog";

describe("swallowEscape", () => {
  it("calls preventDefault and stopPropagation on Escape", () => {
    const e = new KeyboardEvent("keydown", { key: "Escape" });
    const preventDefault = vi.spyOn(e, "preventDefault");
    const stopPropagation = vi.spyOn(e, "stopPropagation");
    swallowEscape(e);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("does nothing for other keys", () => {
    const e = new KeyboardEvent("keydown", { key: "Enter" });
    const preventDefault = vi.spyOn(e, "preventDefault");
    const stopPropagation = vi.spyOn(e, "stopPropagation");
    swallowEscape(e);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

describe("RecoveryDialog", () => {
  const baseProps = {
    savedAt: "2026-05-16 10:00:00",
    nodeCount: 7,
    onRestore: vi.fn(),
    onDiscard: vi.fn(),
  };

  it("exposes the dialog ARIA contract", () => {
    const html = renderToStaticMarkup(<RecoveryDialog {...baseProps} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="recovery-dialog-title"');
    expect(html).toContain('id="recovery-dialog-title"');
    expect(html).toContain('data-testid="recovery-dialog"');
  });

  it("uses the shared modal-scrim/modal-card skin classes (M7-U5)", () => {
    const html = renderToStaticMarkup(<RecoveryDialog {...baseProps} />);
    expect(html).toContain('class="modal-scrim"');
    expect(html).toContain('class="modal-card"');
  });

  it("renders both actions with stable testids and labels", () => {
    const html = renderToStaticMarkup(<RecoveryDialog {...baseProps} />);
    expect(html).toContain('data-testid="recovery-restore"');
    expect(html).toContain('data-testid="recovery-discard"');
    expect(html).toContain("복구");
    expect(html).toContain("새로 시작");
  });

  it("renders saved-at timestamp and node count in the body", () => {
    const html = renderToStaticMarkup(
      <RecoveryDialog
        {...baseProps}
        nodeCount={42}
        savedAt="2026-05-15 09:30"
      />,
    );
    expect(html).toContain("노드 42개");
    expect(html).toContain("2026-05-15 09:30");
  });

  it("places the primary 'restore' action after 'discard' (default Enter target)", () => {
    const html = renderToStaticMarkup(<RecoveryDialog {...baseProps} />);
    const discardIdx = html.indexOf('data-testid="recovery-discard"');
    const restoreIdx = html.indexOf('data-testid="recovery-restore"');
    expect(discardIdx).toBeGreaterThanOrEqual(0);
    expect(restoreIdx).toBeGreaterThan(discardIdx);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpModalView, useHelpModalStore } from "./HelpModal";

describe("useHelpModalStore", () => {
  beforeEach(() => {
    useHelpModalStore.getState().setOpen(false);
  });

  it("starts closed", () => {
    expect(useHelpModalStore.getState().open).toBe(false);
  });

  it("toggle flips open state", () => {
    useHelpModalStore.getState().toggle();
    expect(useHelpModalStore.getState().open).toBe(true);
    useHelpModalStore.getState().toggle();
    expect(useHelpModalStore.getState().open).toBe(false);
  });

  it("setOpen forces a specific value", () => {
    useHelpModalStore.getState().setOpen(true);
    expect(useHelpModalStore.getState().open).toBe(true);
    useHelpModalStore.getState().setOpen(false);
    expect(useHelpModalStore.getState().open).toBe(false);
  });
});

describe("HelpModalView", () => {
  it("renders shortcut sections covering keys, gestures, and globals", () => {
    const html = renderToStaticMarkup(<HelpModalView onClose={vi.fn()} />);
    expect(html).toContain('data-testid="help-modal"');
    expect(html).toContain("Shortcuts");
    expect(html).toContain("Node Graph");
    expect(html).toContain("Delete");
    expect(html).toContain("Backspace");
    expect(html).toContain("선택된 노드 삭제");
    expect(html).toContain("Shift + Drag");
    expect(html).toContain("Command Palette");
  });

  it("exposes a labelled close button", () => {
    const html = renderToStaticMarkup(<HelpModalView onClose={vi.fn()} />);
    expect(html).toContain('aria-label="Close help"');
  });
});

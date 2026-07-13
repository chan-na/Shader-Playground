import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { tokens, withAlpha } from "../../theme";
import { StatusPill } from "./StatusPill";

afterEach(() => {
  cleanup();
});

describe("StatusPill", () => {
  it("renders its children text for each tone", () => {
    const { rerender } = render(
      <StatusPill tone="success">Stream active · 1280×720 @ 30fps</StatusPill>,
    );
    expect(screen.getByText("Stream active · 1280×720 @ 30fps")).not.toBeNull();

    rerender(<StatusPill tone="error">error: permission denied</StatusPill>);
    expect(screen.getByText("error: permission denied")).not.toBeNull();

    rerender(<StatusPill tone="muted">requesting permission…</StatusPill>);
    expect(screen.getByText("requesting permission…")).not.toBeNull();
  });

  it("success tone uses tokens.semantic.success for the alpha-blended bg/border", () => {
    const { container } = render(<StatusPill tone="success">ok</StatusPill>);
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toBe(
      withAlpha(tokens.semantic.success, 0.08),
    );
    expect(root.style.border).toBe(
      `1px solid ${withAlpha(tokens.semantic.success, 0.25)}`,
    );
    expect(root.style.color).toBe("var(--success)");
  });

  it("error tone uses tokens.semantic.error for the alpha-blended bg/border", () => {
    const { container } = render(<StatusPill tone="error">bad</StatusPill>);
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toBe(withAlpha(tokens.semantic.error, 0.08));
    expect(root.style.border).toBe(
      `1px solid ${withAlpha(tokens.semantic.error, 0.25)}`,
    );
    expect(root.style.color).toBe("var(--error)");
  });

  it("muted tone uses the neutral card/border/muted-text triple, not a semantic color", () => {
    const { container } = render(<StatusPill tone="muted">idle</StatusPill>);
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toBe("var(--surface-card)");
    expect(root.style.border).toBe("1px solid var(--border-default)");
    expect(root.style.color).toBe("var(--text-muted)");
  });
});

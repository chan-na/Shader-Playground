import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { arrowKeyDelta, Splitter } from "./Splitter";

describe("Splitter markup", () => {
  it("renders a focusable <hr> (implicit ARIA role=separator) with orientation and label", () => {
    const html = renderToStaticMarkup(
      <Splitter
        orientation="vertical"
        label="test splitter"
        onDelta={vi.fn()}
      />,
    );
    // <hr> carries an implicit ARIA role of "separator" — no explicit
    // role="separator" attribute is written (biome lint/a11y/useSemanticElements
    // flags that pattern on non-semantic elements; using the real <hr> element
    // satisfies both the a11y intent and the lint rule without an ignore).
    expect(html).toMatch(/^<hr\b/);
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="test splitter"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("splitter--vertical");
  });

  it("renders horizontal orientation", () => {
    const html = renderToStaticMarkup(
      <Splitter orientation="horizontal" label="h" onDelta={vi.fn()} />,
    );
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain("splitter--horizontal");
  });
});

describe("arrowKeyDelta", () => {
  it("moves +16 on ArrowRight and -16 on ArrowLeft for vertical splitters", () => {
    expect(arrowKeyDelta("vertical", "ArrowRight")).toBe(16);
    expect(arrowKeyDelta("vertical", "ArrowLeft")).toBe(-16);
  });

  it("ignores ArrowUp/ArrowDown for vertical splitters", () => {
    expect(arrowKeyDelta("vertical", "ArrowUp")).toBeNull();
    expect(arrowKeyDelta("vertical", "ArrowDown")).toBeNull();
  });

  it("moves +16 on ArrowDown and -16 on ArrowUp for horizontal splitters", () => {
    expect(arrowKeyDelta("horizontal", "ArrowDown")).toBe(16);
    expect(arrowKeyDelta("horizontal", "ArrowUp")).toBe(-16);
  });

  it("ignores ArrowLeft/ArrowRight for horizontal splitters", () => {
    expect(arrowKeyDelta("horizontal", "ArrowLeft")).toBeNull();
    expect(arrowKeyDelta("horizontal", "ArrowRight")).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(arrowKeyDelta("vertical", "Enter")).toBeNull();
    expect(arrowKeyDelta("horizontal", "Tab")).toBeNull();
  });
});

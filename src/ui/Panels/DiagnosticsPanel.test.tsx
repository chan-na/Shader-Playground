import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { clearLogBuffer, log } from "../../utils/log";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

describe("DiagnosticsPanel", () => {
  beforeEach(() => clearLogBuffer());

  it("renders the panel chrome (filters + copy/clear/close)", () => {
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain('data-testid="diagnostics-panel"');
    expect(html).toContain('data-testid="diagnostics-level-filter"');
    expect(html).toContain('data-testid="diagnostics-category-filter"');
    expect(html).toContain('data-testid="diagnostics-copy"');
    expect(html).toContain('data-testid="diagnostics-clear"');
    expect(html).toContain('data-testid="diagnostics-close"');
  });

  it("shows the empty-state message when the buffer is empty", () => {
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("표시할 로그가 없습니다");
  });

  it("seeds the list from the log buffer at render time", () => {
    // warn stays below the test-setup minLevel so it doesn't mirror to console,
    // but the buffer records it regardless — which is what the panel reads.
    log.warn("gl", "seed-marker");
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("seed-marker");
    expect(html).toContain("WARN");
    expect(html).toContain("gl");
  });
});

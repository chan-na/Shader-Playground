import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { tokens, withAlpha } from "../../../theme";
import { NODE_GLYPH } from "../nodeTheme";
import { NodeCardHeader } from "./NodeCardHeader";

/** Same pattern as nodeViews.test.tsx's renderInFlow — kept local since this
 * component has no Handle, but the wrapper is cheap and future-proofs against
 * a header that later grows a Handle-dependent meta slot. */
function renderInFlow(element: ReactElement): string {
  return renderToStaticMarkup(<ReactFlowProvider>{element}</ReactFlowProvider>);
}

describe("NodeCardHeader", () => {
  it("renders the source category (Mesh): glyph, title, category colors", () => {
    const cat = tokens.nodeCategory.source;
    const html = renderInFlow(<NodeCardHeader kind="mesh" title="Mesh" />);
    expect(html).toContain(NODE_GLYPH.mesh);
    expect(html).toContain("Mesh");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain(`color:${cat}`);
  });

  it("renders the process category (Shader) with a meta slot", () => {
    const cat = tokens.nodeCategory.process;
    const html = renderInFlow(
      <NodeCardHeader
        kind="shader"
        title="Shader"
        meta={<span data-testid="fixture-meta">0.31ms</span>}
      />,
    );
    expect(html).toContain(NODE_GLYPH.shader);
    expect(html).toContain("Shader");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain('data-testid="fixture-meta"');
    expect(html).toContain("0.31ms");
  });

  it("renders the value category (Param) and omits the meta slot when absent", () => {
    const cat = tokens.nodeCategory.value;
    const html = renderInFlow(<NodeCardHeader kind="param" title="Param" />);
    expect(html).toContain(NODE_GLYPH.param);
    expect(html).toContain("Param");
    expect(html).toContain(withAlpha(cat, 0.22));
    expect(html).toContain(withAlpha(cat, 0.08));
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).not.toContain("fixture-meta");
  });

  it("renders the error tone gradient (0.26/0.1 semantic.error) instead of the category color", () => {
    const err = tokens.semantic.error;
    const cat = tokens.nodeCategory.process;
    const html = renderInFlow(
      <NodeCardHeader kind="shader" title="Shader" tone="error" />,
    );
    expect(html).toContain(withAlpha(err, 0.26));
    expect(html).toContain(withAlpha(err, 0.1));
    expect(html).not.toContain(withAlpha(cat, 0.22));
    // The icon box glyph stays the category color even in error tone — only
    // the header gradient communicates "this instance is broken".
    expect(html).toContain(`border:1px solid ${cat}`);
    expect(html).toContain(`color:${cat}`);
  });
});

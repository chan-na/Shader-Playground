import type { ReactNode } from "react";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { tokens, withAlpha } from "../../theme";
import { firstCompileError } from "./compileErrorInfo";

/**
 * Onboarding hint rows (design/Viewport.dc.html L57-61). Kept as an internal
 * constant — not exported — since only this component ever renders them
 * (a module-level export here with no other importer would trip Knip).
 */
const HINT_ROWS: ReadonlyArray<{ n: number; content: ReactNode }> = [
  {
    n: 1,
    content: (
      <>
        Press <span className="vp-empty-hint-key">⌘K</span> → “Add Output”
      </>
    ),
  },
  { n: 2, content: "Drag a shader’s output into its input" },
  {
    n: 3,
    // dc L60 links to a "preset" anchor (href="#") — replaced with plain text
    // to avoid a dead link in the real app (approved deviation, see task notes).
    content: "Or load a preset from the toolbar to start rolling",
  },
];

/**
 * Viewport empty-state overlay (design/Viewport.dc.html L49-63): shown when
 * the compiled plan has zero drawable Output panes (no Output node, or one
 * with nothing wired into its source). Purely a DOM overlay above the
 * WebGL canvas — `pointer-events: none` throughout so camera drag and the
 * `u_mouse` listeners on the canvas keep working underneath it.
 */
export function EmptyState() {
  const panes = useRendererStore((s) => s.panes);
  const byNode = useDiagnosticsStore((s) => s.byNode);
  const nodes = useGraphStore((s) => s.nodes);
  if (panes.length > 0) return null;
  // A compile failure can also drop every drawable pane to zero — that is
  // not "no Output connected", so don't show this message for it. The
  // CompileErrorOverlay renders instead (see Viewport/index.tsx mount order).
  if (firstCompileError(byNode, nodes) !== null) return null;

  return (
    <div className="vp-empty" data-testid="viewport-empty">
      <div className="vp-empty-icon">◵</div>
      <div className="vp-empty-text">
        <div className="vp-empty-title">No Output connected</div>
        <div className="vp-empty-body">
          Add an <span className="vp-empty-body-accent">Output</span> node and
          wire a shader into it to see the render here. Up to four outputs tile
          the viewport.
        </div>
      </div>
      <div className="vp-empty-hints">
        {HINT_ROWS.map((row) => (
          <div className="vp-empty-hint" key={row.n}>
            <span
              className="vp-empty-hint-chip"
              style={{
                background: withAlpha(tokens.accent.default, 0.16),
              }}
            >
              {row.n}
            </span>
            <span className="vp-empty-hint-text">{row.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

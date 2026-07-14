import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { firstCompileError, formatDiagnosticRaw } from "./compileErrorInfo";

/**
 * Viewport compile-error overlay (design/System States.dc.html L216-244):
 * shown instead of the WebGL canvas when the first shader node with an
 * error-severity diagnostic drops every drawable Output pane (0-length
 * `panes`). Deliberately checked *before* EmptyState's "No Output connected"
 * message — a broken shader is not the same problem as an unwired graph, and
 * EmptyState early-returns null once this overlay would apply (see
 * EmptyState.tsx) so the two never render at once.
 *
 * Renders null whenever at least one Output pane is still drawable (a
 * partial-failure graph keeps showing its live panes — this overlay never
 * covers a working render) or when no shader node currently carries an
 * error-severity diagnostic.
 *
 * Its action row (Jump to line / Copy log, M7-U4) shares its mount condition
 * with TransportBar's own self-gate (`panes.length === 0`, see
 * TransportBar.tsx) — the transport bar cannot be mounted whenever this
 * overlay is, so its floating `z-index` can never sit above these buttons
 * and make them pointer-unreachable, matching dc's compile-error mock
 * (System States.dc.html), which never shows a transport bar either.
 */
export function CompileErrorOverlay() {
  const byNode = useDiagnosticsStore((s) => s.byNode);
  const nodes = useGraphStore((s) => s.nodes);
  const panes = useRendererStore((s) => s.panes);

  const info = firstCompileError(byNode, nodes);
  if (panes.length !== 0 || info === null) return null;

  const targetStage = info.stage === "link" ? "fragment" : info.stage;

  const handleJump = () => {
    useSelectionStore.getState().select(info.nodeId);
    useEditorStore.getState().setStage(targetStage);
    if (info.line !== null) {
      useEditorStore.getState().requestJump({
        nodeId: info.nodeId,
        stage: targetStage,
        line: info.line,
      });
    }
  };

  const handleCopy = () => {
    const diags = byNode[info.nodeId];
    if (!diags) return;
    const raw = [...diags.vertex, ...diags.fragment, ...diags.link]
      .filter((d) => d.severity === "error")
      .map((d) => formatDiagnosticRaw(d))
      .join("\n");
    void navigator.clipboard?.writeText(raw);
  };

  return (
    <div
      className="vp-error-root"
      data-testid="viewport-compile-error"
      style={{
        background: `radial-gradient(circle at 50% 40%, ${withAlpha(tokens.semantic.error, 0.14)}, transparent 62%), var(--surface-app)`,
      }}
    >
      <div className="vp-error-col">
        <div
          className="vp-error-icon"
          style={{
            background: withAlpha(tokens.semantic.error, 0.14),
            border: `1px solid ${withAlpha(tokens.semantic.error, 0.45)}`,
          }}
        >
          ⚠
        </div>
        <div className="vp-error-text">
          <div className="vp-error-title">Shader failed to compile</div>
          <div className="vp-error-sub">
            {info.title} · {info.stage} stage ·{" "}
            <span style={{ color: "var(--error)" }}>
              {info.errorCount} error{info.errorCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {info.excerpt.length > 0 && (
          <div
            className="vp-error-card"
            style={{
              border: `1px solid ${withAlpha(tokens.semantic.error, 0.25)}`,
            }}
          >
            <div className="vp-error-card-body">
              <div className="vp-error-gutter">
                {info.excerpt.map((row) => (
                  <div
                    key={row.lineNo}
                    className="vp-error-gutter-row"
                    style={
                      row.isError
                        ? {
                            background: withAlpha(tokens.semantic.error, 0.16),
                            color: "var(--error)",
                          }
                        : undefined
                    }
                  >
                    {row.lineNo}
                  </div>
                ))}
              </div>
              <div className="vp-error-code">
                {info.excerpt.map((row) => (
                  <div
                    key={row.lineNo}
                    className="vp-error-code-row"
                    style={
                      row.isError
                        ? { background: withAlpha(tokens.semantic.error, 0.14) }
                        : undefined
                    }
                  >
                    {row.text}
                  </div>
                ))}
              </div>
            </div>
            <div
              className="vp-error-footer"
              style={{
                borderTop: `1px solid ${withAlpha(tokens.semantic.error, 0.25)}`,
                background: withAlpha(tokens.semantic.error, 0.08),
              }}
            >
              {/* raw already carries its severity prefix
                  (formatDiagnosticRaw → `ERROR: 0:{line}[:col]: {msg}`) —
                  do not prepend another one (dc System States.dc.html L237
                  shows a single-prefix footer). */}
              {info.raw}
            </div>
          </div>
        )}
        <div className="vp-error-actions">
          <button
            type="button"
            className="vp-error-btn-jump"
            data-testid="compile-error-jump"
            onClick={handleJump}
          >
            {info.line !== null
              ? `Jump to line ${info.line}`
              : "Open in editor"}
          </button>
          <button
            type="button"
            className="vp-error-btn-copy"
            data-testid="compile-error-copy"
            onClick={handleCopy}
          >
            Copy log
          </button>
        </div>
      </div>
    </div>
  );
}

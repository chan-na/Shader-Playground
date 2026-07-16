import { useMemo } from "react";
import type { GLSLDiagnostic } from "../../core/graph/diagnostics";
import { displayNodeName } from "../../core/nodes/registry";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { summarizeProblems } from "./problemsSummary";

interface Entry {
  nodeId: string;
  stage: "vertex" | "fragment" | "link";
  diag: GLSLDiagnostic;
}

type Severity = GLSLDiagnostic["severity"];

// design/Side Panel.dc.html L192-194 / L198-199: ✕/⚠/ⓘ paired with
// semantic.error/warning/info — the panel's only severity → glyph/color map.
const SEVERITY_ICON: Record<Severity, string> = {
  error: "✕",
  warning: "⚠",
  info: "ⓘ",
};
const SEVERITY_VAR: Record<Severity, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--info)",
};

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ProblemsPanel() {
  const byNode = useDiagnosticsStore((s) => s.byNode);
  const runtimeErrors = useRendererStore((s) => s.stats.errors);
  const nodes = useGraphStore((s) => s.nodes);
  const select = useSelectionStore((s) => s.select);
  const setStage = useEditorStore((s) => s.setStage);
  const requestJump = useEditorStore((s) => s.requestJump);

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    for (const [nodeId, diags] of Object.entries(byNode)) {
      for (const d of diags.vertex)
        out.push({ nodeId, stage: "vertex", diag: d });
      for (const d of diags.fragment)
        out.push({ nodeId, stage: "fragment", diag: d });
      for (const d of diags.link) out.push({ nodeId, stage: "link", diag: d });
    }
    return out;
  }, [byNode]);

  // design/Side Panel.dc.html L192-194: severity summary chips, one per
  // severity present (>0 count) above the diagnostic/runtime-error list.
  const summary = useMemo(
    () =>
      summarizeProblems(
        entries.map((e) => ({ severity: e.diag.severity })),
        runtimeErrors.length,
      ),
    [entries, runtimeErrors.length],
  );

  const nodeLabel = (id: string) => {
    const n = nodes.find((nn) => nn.id === id);
    // `kind` is dropped (D15 UI clean-up): the row already shows
    // `stage:line[:column]` right after this label, and `kind` duplicated
    // that context without adding anything the stage doesn't already say.
    // A diagnostic can outlive its node (e.g. deleted while a stale
    // diagnostic entry is still in flight) — fall back to the id so the row
    // still identifies *something* instead of going blank.
    return n ? displayNodeName(n) : id;
  };

  const goTo = (entry: Entry) => {
    select(entry.nodeId);
    const targetStage: "vertex" | "fragment" =
      entry.stage === "link" ? "fragment" : entry.stage;
    setStage(targetStage);
    requestJump({
      nodeId: entry.nodeId,
      stage: targetStage,
      line: entry.diag.line,
      ...(entry.diag.column !== undefined && { column: entry.diag.column }),
    });
  };

  const hasAny = summary.error > 0 || summary.warning > 0 || summary.info > 0;

  return (
    <div className="panel-body" style={{ overflowY: "auto" }}>
      {!hasAny && <div className="inspector-empty">No problems</div>}
      {hasAny && (
        <div className="problems-chip-row">
          {summary.error > 0 && (
            <span className="problems-chip">
              <span style={{ color: SEVERITY_VAR.error }}>
                {SEVERITY_ICON.error}
              </span>
              {pluralize(summary.error, "error")}
            </span>
          )}
          {summary.warning > 0 && (
            <span className="problems-chip">
              <span style={{ color: SEVERITY_VAR.warning }}>
                {SEVERITY_ICON.warning}
              </span>
              {pluralize(summary.warning, "warning")}
            </span>
          )}
          {summary.info > 0 && (
            <span className="problems-chip">
              <span style={{ color: SEVERITY_VAR.info }}>
                {SEVERITY_ICON.info}
              </span>
              {pluralize(summary.info, "info")}
            </span>
          )}
        </div>
      )}
      {runtimeErrors.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">
            Runtime errors ({runtimeErrors.length})
          </div>
          {runtimeErrors.map((e) => (
            <div
              key={`runtime:${e}`}
              className="problems-card"
              style={{ borderLeft: `2px solid ${SEVERITY_VAR.error}` }}
            >
              <span
                className="problems-card-icon"
                style={{ color: SEVERITY_VAR.error }}
              >
                {SEVERITY_ICON.error}
              </span>
              <div className="problems-card-body">
                <div className="problems-card-message problems-card-message--mono">
                  {e}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">
            Shader diagnostics ({entries.length})
          </div>
          {entries.map((e, i) => {
            const rowKey = `${e.nodeId}:${e.stage}:${e.diag.line}:${e.diag.column ?? "_"}:${i}`;
            return (
              <button
                type="button"
                key={rowKey}
                className="problems-card"
                style={{
                  borderLeft: `2px solid ${SEVERITY_VAR[e.diag.severity]}`,
                }}
                onClick={() => goTo(e)}
                title="Jump to source"
                data-testid="problem-row"
                data-node-id={e.nodeId}
                data-stage={e.stage}
                data-line={e.diag.line}
              >
                <span
                  className="problems-card-icon"
                  style={{ color: SEVERITY_VAR[e.diag.severity] }}
                >
                  {SEVERITY_ICON[e.diag.severity]}
                </span>
                <div className="problems-card-body">
                  <div className="problems-card-message">{e.diag.message}</div>
                  <div className="problems-card-loc">
                    {nodeLabel(e.nodeId)} · {e.stage}:{e.diag.line}
                    {e.diag.column !== undefined ? `:${e.diag.column}` : ""} ·{" "}
                    <span className="problems-card-jump">jump ▸</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

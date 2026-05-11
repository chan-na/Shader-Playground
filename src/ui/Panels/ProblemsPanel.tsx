import { useMemo } from "react";
import type { GLSLDiagnostic } from "../../core/graph/diagnostics";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";

interface Entry {
  nodeId: string;
  stage: "vertex" | "fragment" | "link";
  diag: GLSLDiagnostic;
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

  const nodeLabel = (id: string) => {
    const n = nodes.find((nn) => nn.id === id);
    return n ? `${n.kind} · ${id}` : id;
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

  return (
    <div className="panel-body" style={{ overflowY: "auto" }}>
      {entries.length === 0 && runtimeErrors.length === 0 && (
        <div className="inspector-empty">No problems</div>
      )}
      {runtimeErrors.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">
            Runtime errors ({runtimeErrors.length})
          </div>
          {runtimeErrors.map((e) => (
            <div
              key={`runtime:${e}`}
              className="problem-row"
              style={{ color: "#ff8484" }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>{e}</span>
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
            const color =
              e.diag.severity === "error"
                ? "#ff8484"
                : e.diag.severity === "warning"
                  ? "#dcc46c"
                  : "#7aa6e8";
            const rowKey = `${e.nodeId}:${e.stage}:${e.diag.line}:${e.diag.column ?? "_"}:${i}`;
            return (
              <button
                type="button"
                key={rowKey}
                className="problem-row"
                onClick={() => goTo(e)}
                title="Jump to source"
                data-testid="problem-row"
                data-node-id={e.nodeId}
                data-stage={e.stage}
                data-line={e.diag.line}
              >
                <span
                  style={{
                    color,
                    fontFamily: "monospace",
                    fontSize: 11,
                    marginRight: 6,
                  }}
                >
                  ●
                </span>
                <span style={{ color: "#bbb", fontSize: 11 }}>
                  <strong>{nodeLabel(e.nodeId)}</strong> · {e.stage}:
                  {e.diag.line}
                  {e.diag.column !== undefined ? `:${e.diag.column}` : ""}
                </span>
                <span
                  style={{
                    display: "block",
                    color: "#ddd",
                    fontSize: 12,
                    marginTop: 2,
                    paddingLeft: 14,
                    wordBreak: "break-word",
                  }}
                >
                  {e.diag.message}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

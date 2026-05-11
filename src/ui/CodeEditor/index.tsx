import { setDiagnostics } from "@codemirror/lint";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { ShaderGraphNode } from "../../core/graph/types";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { useSelectionStore } from "../../state/selectionStore";
import { debounce } from "../../utils/debounce";
import { glslExtensions } from "./glslSetup";
import { toCMDiagnostics } from "./lintAdapter";
import { StageTabs } from "./StageTabs";

export function CodeEditor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedKeyRef = useRef<string>("");
  const lastCommittedRef = useRef<string>("");
  const ctxRef = useRef<{ id: string | null; stage: "vertex" | "fragment" }>({
    id: null,
    stage: "fragment",
  });

  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const stage = useEditorStore((s) => s.activeStage);
  const setStage = useEditorStore((s) => s.setStage);
  const jumpRequest = useEditorStore((s) => s.jumpRequest);
  const clearJump = useEditorStore((s) => s.clearJump);
  const fps = useRendererStore((s) => s.stats.fps);

  const firstShaderId = useGraphStore(
    (s) => s.nodes.find((n) => n.kind === "shader")?.id ?? null,
  );
  const effectiveId = selectedId ?? firstShaderId;

  const node = useGraphStore(
    (s) =>
      s.nodes.find((n) => n.id === effectiveId && n.kind === "shader") as
        | ShaderGraphNode
        | undefined,
  );

  const source = node
    ? stage === "vertex"
      ? node.vertexSource
      : node.fragmentSource
    : "";

  const diags = useDiagnosticsStore((s) =>
    effectiveId ? s.byNode[effectiveId] : undefined,
  );

  // Keep the latest (id, stage) in a ref so the mount-time listener can read it.
  ctxRef.current = { id: effectiveId, stage };

  // Mount editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const commit = debounce((value: string) => {
      const { id, stage: st } = ctxRef.current;
      if (!id) return;
      const cur = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!cur || cur.kind !== "shader") return;
      const sn = cur as ShaderGraphNode;
      if (st === "vertex") {
        if (sn.vertexSource === value) return;
        lastCommittedRef.current = value;
        useGraphStore
          .getState()
          .updateShaderSource(id, { vertexSource: value });
      } else {
        if (sn.fragmentSource === value) return;
        lastCommittedRef.current = value;
        useGraphStore
          .getState()
          .updateShaderSource(id, { fragmentSource: value });
      }
    }, 50);

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) commit(u.state.doc.toString());
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [...glslExtensions(), updateListener],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      commit.cancel();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Reload editor doc when:
  //  (a) selected node or stage changes (different document), or
  //  (b) the store source moved away from the value we last committed
  //      (i.e., an external change like graph reset). Mid-typing renders
  //      where store==lastCommitted and editor has newer text are skipped
  //      so we never wipe in-flight edits.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const key = `${effectiveId ?? "∅"}::${stage}`;
    const switching = loadedKeyRef.current !== key;
    const externalChange = source !== lastCommittedRef.current;
    if (!switching && !externalChange) return;
    loadedKeyRef.current = key;
    lastCommittedRef.current = source;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
  }, [effectiveId, stage, source]);

  // Scroll/select to a requested line (from ProblemsPanel) once the editor
  // doc matches the requested node/stage.
  useEffect(() => {
    if (!jumpRequest) return;
    if (jumpRequest.nodeId !== effectiveId) return;
    if (jumpRequest.stage !== stage) return;
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const lineNo = Math.max(1, Math.min(doc.lines, jumpRequest.line));
    const line = doc.line(lineNo);
    const pos = jumpRequest.column
      ? Math.min(line.to, line.from + Math.max(0, jumpRequest.column - 1))
      : line.from;
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
      scrollIntoView: true,
    });
    view.focus();
    clearJump();
  }, [jumpRequest, effectiveId, stage, clearJump]);

  // Push diagnostics to CM
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const stageDiags = diags
      ? stage === "vertex"
        ? diags.vertex
        : diags.fragment
      : [];
    const linkDiags = diags?.link ?? [];
    const all = [...stageDiags, ...linkDiags];
    view.dispatch(setDiagnostics(view.state, toCMDiagnostics(view, all)));
  }, [diags, stage]);

  const vertexHasError =
    (diags?.vertex.length ?? 0) > 0 || (diags?.link.length ?? 0) > 0;
  const fragmentHasError =
    (diags?.fragment.length ?? 0) > 0 || (diags?.link.length ?? 0) > 0;

  return (
    <div className="panel panel--code">
      <div className="panel-header">
        Code · {fps} fps {effectiveId ? `· ${effectiveId}` : ""}
      </div>
      <StageTabs
        active={stage}
        onChange={setStage}
        vertexHasError={vertexHasError}
        fragmentHasError={fragmentHasError}
      />
      <div className="panel-body">
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            display: node ? "block" : "none",
          }}
        />
        {!node && (
          <div className="placeholder-message">No shader node selected</div>
        )}
      </div>
    </div>
  );
}

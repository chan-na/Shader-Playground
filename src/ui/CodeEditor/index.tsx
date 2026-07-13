import { setDiagnostics } from "@codemirror/lint";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { glslValidator } from "../../core/glsl/glslValidator";
import type { GLSLDiagnostic } from "../../core/graph/diagnostics";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { debounce } from "../../utils/debounce";
import { DockPanelHeader } from "../DockPanelHeader";
import { setCurrentView } from "./currentView";
import { glslExtensions } from "./glslSetup";
import { toCMDiagnostics } from "./lintAdapter";
import { StageTabs } from "./StageTabs";

/** Debounced source-commit; carries the edit's (node, stage) target so a later
 * node/stage switch cannot misroute or drop the trailing call (L17). */
type CommitTarget = { id: string | null; stage: "vertex" | "fragment" };
type CommitFn = ((value: string, target: CommitTarget) => void) & {
  cancel: () => void;
  flush: () => void;
};

export function CodeEditor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedKeyRef = useRef<string>("");
  const lastCommittedRef = useRef<string>("");
  const ctxRef = useRef<{ id: string | null; stage: "vertex" | "fragment" }>({
    id: null,
    stage: "fragment",
  });
  // Holds the mount-time debounced commit so the reload effect can flush any
  // pending edit before it replaces the doc on a node/stage switch (L17).
  const commitRef = useRef<CommitFn | null>(null);

  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const stage = useEditorStore((s) => s.activeStage);
  const setStage = useEditorStore((s) => s.setStage);
  const jumpRequest = useEditorStore((s) => s.jumpRequest);
  const clearJump = useEditorStore((s) => s.clearJump);

  const firstShaderId = useGraphStore(
    (s) => s.nodes.find((n) => n.kind === "shader")?.id ?? null,
  );
  const effectiveId = selectedId ?? firstShaderId;

  const node = useGraphStore(
    (s) =>
      s.nodes.find(
        (n) =>
          n.id === effectiveId && (n.kind === "shader" || n.kind === "compute"),
      ) as ShaderGraphNode | ComputeGraphNode | undefined,
  );
  const isCompute = node?.kind === "compute";

  const source = node
    ? isCompute
      ? (node as ComputeGraphNode).vertexSource
      : stage === "vertex"
        ? (node as ShaderGraphNode).vertexSource
        : (node as ShaderGraphNode).fragmentSource
    : "";

  const diags = useDiagnosticsStore((s) =>
    effectiveId ? s.byNode[effectiveId] : undefined,
  );

  // Live (pre-recompile) diagnostics from the OffscreenCanvas WebGL2 worker —
  // see Architecture §8.4. Scoped to the currently-edited (node, stage); we
  // clear it on switch (the validator may still be flying for the old doc).
  const [liveDiags, setLiveDiags] = useState<GLSLDiagnostic[]>([]);
  const setLiveDiagsRef = useRef(setLiveDiags);
  setLiveDiagsRef.current = setLiveDiags;

  // Keep the latest (id, stage) in a ref so the mount-time listener can read it.
  ctxRef.current = { id: effectiveId, stage };

  // Mount editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const commit = debounce((value: string, target: CommitTarget) => {
      const { id, stage: st } = target;
      if (!id) return;
      const cur = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!cur) return;
      if (cur.kind === "compute") {
        const cn = cur as ComputeGraphNode;
        if (cn.vertexSource === value) return;
        lastCommittedRef.current = value;
        useGraphStore.getState().updateComputeSource(id, value);
        return;
      }
      if (cur.kind !== "shader") return;
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

    // Live validate — runs ahead of (and independently from) the GL recompile
    // pipeline. The worker is lazily created on the first dispatch (see
    // GlslValidator) so editors that never see typing pay nothing. Resolved
    // diagnostics are only applied if (id, stage) still matches when the
    // promise lands, so node-switch races cannot push stale diags.
    const liveValidate = debounce((value: string) => {
      const { id, stage: st } = ctxRef.current;
      if (!id) return;
      const cur = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!cur) return;
      // Compute nodes only have a vertex source; shader nodes pick by tab.
      const validateStage: "vertex" | "fragment" =
        cur.kind === "compute" ? "vertex" : st;
      void glslValidator()
        .validate(validateStage, value)
        .then((diags) => {
          const ctx = ctxRef.current;
          if (ctx.id !== id || ctx.stage !== st) return;
          setLiveDiagsRef.current(diags);
        });
    }, 150);

    commitRef.current = commit;

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const text = u.state.doc.toString();
        // Snapshot the edit's target now — if the user switches node/stage
        // before the 50ms window fires, the trailing commit must still land on
        // the document that was actually edited, not the one now on screen.
        commit(text, { ...ctxRef.current });
        liveValidate(text);
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [...glslExtensions(), updateListener],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    setCurrentView(view);
    return () => {
      commit.cancel();
      liveValidate.cancel();
      commitRef.current = null;
      setCurrentView(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Reload editor doc when:
  //  (a) selected node or stage changes (different document), or
  //  (b) the store source moved away from the value we last committed
  //      (i.e., an external change like graph reset). Mid-typing renders
  //      where store==lastCommitted and editor has newer text are skipped
  //      so we never wipe in-flight edits. On a true document switch we also
  //      drop any in-flight live diagnostic — the next keystroke (or the
  //      upcoming store recompile) repopulates it.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const key = `${effectiveId ?? "∅"}::${stage}`;
    const switching = loadedKeyRef.current !== key;
    const externalChange = source !== lastCommittedRef.current;
    if (!switching && !externalChange) return;
    // On a real document switch, flush any pending debounced commit FIRST so
    // the last <50ms of edits to the *outgoing* (node, stage) are written
    // before we overwrite the editor. The commit captured its own target at
    // type-time, so it lands on the correct node even though ctxRef has already
    // advanced to the incoming document. Without this, the reload dispatch
    // below re-triggers the commit debounce with the incoming text and clears
    // the pending one, silently dropping those edits. (L17)
    if (switching) commitRef.current?.flush();
    loadedKeyRef.current = key;
    lastCommittedRef.current = source;
    if (switching) setLiveDiags([]);
    // Same-document external change where the editor already shows exactly
    // `source` (e.g. a cross-stage F2 rename that mutated the doc via its own
    // dispatch *and* committed to the store in the same turn): skip the full
    // replace. A {from:0,to:len} dispatch carries no selection, so it would
    // otherwise collapse the cursor to offset 0. On a real document switch we
    // always reload (cursor reset there is expected). (M11)
    if (!switching && source === view.state.doc.toString()) return;
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

  // Push diagnostics to CM — merge authoritative (recompile) diagnostics from
  // diagnosticsStore with pre-compile diagnostics from the live worker. The
  // store is the source of truth; when both have an entry at the same line
  // and severity we drop the live one to avoid duplicate underlines (Phase 24).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const stageDiags = diags
      ? stage === "vertex"
        ? diags.vertex
        : diags.fragment
      : [];
    const linkDiags = diags?.link ?? [];
    const auth = [...stageDiags, ...linkDiags];
    const authKeys = new Set(auth.map((d) => `${d.line}:${d.severity}`));
    const live = liveDiags.filter(
      (d) => !authKeys.has(`${d.line}:${d.severity}`),
    );
    const all = [...auth, ...live];
    view.dispatch(setDiagnostics(view.state, toCMDiagnostics(view, all)));
  }, [diags, stage, liveDiags]);

  const stageLiveHasError = liveDiags.some((d) => d.severity === "error");
  const vertexHasError =
    (diags?.vertex.length ?? 0) > 0 ||
    (diags?.link.length ?? 0) > 0 ||
    (stage === "vertex" && stageLiveHasError);
  const fragmentHasError =
    (diags?.fragment.length ?? 0) > 0 ||
    (diags?.link.length ?? 0) > 0 ||
    (stage === "fragment" && stageLiveHasError);

  return (
    <div className="panel panel--code">
      <DockPanelHeader panelId="codeEditor" meta="GLSL · ES 3.0">
        <StageTabs
          active={stage}
          onChange={setStage}
          vertexHasError={vertexHasError}
          fragmentHasError={fragmentHasError}
        />
        {effectiveId && (
          <>
            <span className="dock-header-divider" aria-hidden="true" />
            <span className="dock-header-node-id">{effectiveId}</span>
          </>
        )}
      </DockPanelHeader>
      <div className="panel-body">
        <div
          ref={containerRef}
          data-testid="code-editor"
          data-active-node={effectiveId ?? ""}
          data-active-stage={stage}
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

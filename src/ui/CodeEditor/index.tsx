import { setDiagnostics } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { glslValidator } from "../../core/glsl/glslValidator";
import type { GLSLDiagnostic } from "../../core/graph/diagnostics";
import type { ComputeGraphNode, ShaderGraphNode } from "../../core/graph/types";
import { displayNodeName } from "../../core/nodes/registry";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { debounce } from "../../utils/debounce";
import { DockPanelHeader } from "../DockPanelHeader";
import { NODE_GLYPH } from "../NodeEditor/nodeTheme";
import { AutoOpenToggle } from "./AutoOpenToggle";
import { setCurrentView } from "./currentView";
import { pickEditorNodeId } from "./editorNode";
import { glslExtensions } from "./glslSetup";
import { toCMDiagnostics } from "./lintAdapter";
import { MultiSelectBanner } from "./MultiSelectBanner";
import { StageTabs } from "./StageTabs";

/** Node breadcrumb chip (Code Editor.dc.html L39-43) — accent-tinted pill
 * showing the currently-edited node's category glyph, display name, and
 * kind. Rendered in the Code body's own stage-tab sub-strip (`.code-stage-
 * strip`, below `DockPanelHeader`), right after the stage tabs — **not**
 * the dock header's `children` slot anymore (design/CHANGELOG.md §v2.0
 * Changed: "Code는 [● Code] 탭 + GLSL 배지 헤더 + vertex/fragment 스테이지
 * 탭을 본문 하위 스트립으로 이동"). At the v2.0 25%-width Code column, the
 * dock header alone (grab + `[● Code ✕]` tab + `GLSL · ES 3.0` meta +
 * collapse/maximize/close) already fills the ~359px panel; keeping the
 * stage tabs + this chip in that same row pushed the trailing buttons past
 * the panel's right edge (clipped by `.panel`'s `overflow:hidden`, real
 * pointer unreachable even though the DOM node was technically present).
 * M3 regression fix: this chip (plus its leading divider) now renders
 * inside a `.code-stage-strip-meta` wrapper (index.css) instead of as two
 * bare fragment children of `.code-stage-strip` — the wrapper is what
 * actually collapses to 0 width under squeeze (see its index.css comment);
 * this component's own `minWidth: 0` below is only the inner half of that
 * — it lets the chip shrink *within* the wrapper before the wrapper itself
 * has to clip it entirely. */
const BREADCRUMB_CONTAINER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "3px 10px 3px 7px",
  background: withAlpha(tokens.accent.default, 0.1),
  border: `1px solid ${tokens.accent.muted}`,
  borderRadius: tokens.radius.button,
  minWidth: 0,
};
const BREADCRUMB_ICON_STYLE: CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: tokens.radius.iconBox,
  background: withAlpha(tokens.accent.default, 0.2),
  border: `1px solid ${tokens.accent.default}`,
  fontSize: 9,
  color: tokens.accent.hover,
};
const BREADCRUMB_NAME_STYLE: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: tokens.text.primary,
  // M3 regression fix: the node display name is the one part of the
  // breadcrumb with unbounded length, so it's the part that truncates
  // when `.code-stage-strip` is too narrow (icon and kind stay fixed).
  // `minWidth: 0` overrides the flex-item default (min-content size),
  // which is required for `textOverflow: ellipsis` to ever take effect.
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};
const BREADCRUMB_KIND_STYLE: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 9,
  color: tokens.text.muted,
};

function NodeBreadcrumb({
  name,
  kind,
}: {
  name: string;
  kind: "shader" | "compute";
}) {
  return (
    <div style={BREADCRUMB_CONTAINER_STYLE}>
      <span style={BREADCRUMB_ICON_STYLE} aria-hidden="true">
        {NODE_GLYPH[kind]}
      </span>
      <span style={BREADCRUMB_NAME_STYLE}>{name}</span>
      <span style={BREADCRUMB_KIND_STYLE}>{kind}</span>
    </div>
  );
}

/** Debounced source-commit; carries the edit's (node, stage) target so a later
 * node/stage switch cannot misroute or drop the trailing call (L17). */
type CommitTarget = { id: string | null; stage: "vertex" | "fragment" };
type CommitFn = ((value: string, target: CommitTarget) => void) & {
  cancel: () => void;
  flush: () => void;
};

/** Merge authoritative (recompile) diagnostics with the pre-compile ones from
 * the live worker. The store is the source of truth; when both have an entry at
 * the same line and severity we drop the live one to avoid duplicate underlines
 * (Phase 24). Module-local so both the steady-state diagnostics effect and the
 * document-swap compensating dispatch compute the exact same set. */
function mergeDiagnostics(
  diags: NodeDiagnostics | undefined,
  stage: "vertex" | "fragment",
  live: GLSLDiagnostic[],
): GLSLDiagnostic[] {
  const stageDiags = diags
    ? stage === "vertex"
      ? diags.vertex
      : diags.fragment
    : [];
  const auth = [...stageDiags, ...(diags?.link ?? [])];
  const authKeys = new Set(auth.map((d) => `${d.line}:${d.severity}`));
  return [
    ...auth,
    ...live.filter((d) => !authKeys.has(`${d.line}:${d.severity}`)),
  ];
}

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
  // The exact extension array the mounted EditorState was built from. Every
  // `setState` MUST reuse this identical array — see the reload effect (#1a).
  const extRef = useRef<Extension[] | null>(null);
  // Mount-time debounced live validator, so the reload effect can kick it for a
  // swapped-in document (a `setState` produces no ViewUpdate, so the update
  // listener that normally drives it never runs).
  const liveValidateRef = useRef<((value: string) => void) | null>(null);

  const selectedId = useSelectionStore((s) => s.selectedNodeId);
  const selectedIds = useSelectionStore((s) => s.selectedNodeIds);
  const isMulti = selectedIds.length >= 2;
  const stage = useEditorStore((s) => s.activeStage);
  const setStage = useEditorStore((s) => s.setStage);
  const jumpRequest = useEditorStore((s) => s.jumpRequest);
  const clearJump = useEditorStore((s) => s.clearJump);

  // Which node this editor edits — `pickEditorNodeId` is the shared rule (#10),
  // called *inside* the selector so the component stays reactive to both the
  // selection and the node list. `rename.ts` reads the same rule through
  // `currentEditorNodeId()`, so F2's cross-stage context can never disagree
  // with the document on screen.
  const effectiveId = useGraphStore((s) =>
    pickEditorNodeId(selectedId, s.nodes),
  );

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
  // Read by the reload effect's compensating dispatch without widening that
  // effect's trigger set (which is deliberately just the document identity).
  const diagsRef = useRef<NodeDiagnostics | undefined>(undefined);
  diagsRef.current = diags;

  // Multi-select banner (Code Editor.dc.html L56-72) — subscribe to the raw
  // slices (whole nodes array / whole diagnostics map) rather than deriving a
  // fresh array inside the selector itself (zustand's default selector
  // equality is referential, so a selector-created array would never be
  // considered "unchanged"). The chip list is memoized from those slices plus
  // selectedIds instead, recomputing only when one of them actually changes.
  const allNodes = useGraphStore((s) => s.nodes);
  const diagsByNode = useDiagnosticsStore((s) => s.byNode);
  const multiSelectChips = useMemo(() => {
    if (!isMulti) return [];
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    const chips: Array<{ id: string; label: string; hasError: boolean }> = [];
    for (const id of selectedIds) {
      const n = byId.get(id);
      if (!n || (n.kind !== "shader" && n.kind !== "compute")) continue;
      const d = diagsByNode[id];
      const hasError = Boolean(
        d &&
          (d.vertex.length > 0 || d.fragment.length > 0 || d.link.length > 0),
      );
      // A stale id (selected but since removed from the graph) never reaches
      // this push — the `!n` guard above already `continue`s past it, so
      // there is no separate "id as label" fallback to write here; `n` is
      // always a live node once we get this far.
      chips.push({ id, label: displayNodeName(n), hasError });
    }
    return chips;
  }, [isMulti, selectedIds, allNodes, diagsByNode]);

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

    // ⚠ ONE array, reused by the initial state and by every `setState` in the
    // reload effect. Rebuilding it there as `glslExtensions()` alone would drop
    // `updateListener` from the swapped-in state, and from that moment on every
    // keystroke would stop reaching the store — a silent data-loss regression
    // that typecheck / lint / knip cannot see (#1a).
    const extensions: Extension[] = [...glslExtensions(), updateListener];
    extRef.current = extensions;
    liveValidateRef.current = liveValidate;

    const view = new EditorView({
      state: EditorState.create({ doc: "", extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    setCurrentView(view);
    return () => {
      commit.cancel();
      liveValidate.cancel();
      commitRef.current = null;
      liveValidateRef.current = null;
      extRef.current = null;
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
  //
  // (a) replaces the whole EditorState (`view.setState`) rather than dispatching
  // a {from:0,to:len} change, because vertex.glsl and fragment.glsl of node A
  // and node B are four *different documents* that happen to share one view.
  // A change transaction keeps one undo timeline across all of them, so Cmd+Z
  // right after a switch pops the document-load transaction and pours the
  // previous document into the current stage — which the 50ms commit debounce
  // then writes to the store, destroying the real source (#1a).
  //
  // What `setState` resets, extension by extension (glslSetup.ts:26-48) — #1e:
  //   • `history()`            → undo/redo stack. THE POINT: per-document
  //                              timelines. (`historyCompartment.reconfigure`
  //                              cannot do this — @codemirror/commands keeps the
  //                              field on a module singleton and its
  //                              reconfigure path explicitly *preserves* state.)
  //   • `foldGutter()`         → folded ranges (fold state field) are lost.
  //   • `lintGutter()` + the lint field appended by `setDiagnostics`  → gutter
  //                              markers AND underlines. The lint extension is
  //                              installed via `StateEffect.appendConfig`, so it
  //                              is not in `extRef` at all — the compensating
  //                              dispatch below reinstalls it for the new doc.
  //   • `glslAutocomplete()`   → an open completion popup closes.
  //   • `glslHoverTooltip()`   → an open hover tooltip is dismissed.
  //   • `glslSemanticHighlight()` / `glslReferenceHighlight()` / `bracketMatching()`
  //     / `highlightActiveLine()` / `drawSelection()` → ViewPlugin instances are
  //     recreated and their decoration RangeSets rebuilt from the new doc (no
  //     user-visible loss — they are pure functions of doc+selection).
  //   • `glsl()` language      → a fresh parse of the new document.
  //   • selection + scroll position reset to the document start (expected on a
  //     document switch; the ProblemsPanel jump effect re-positions when asked).
  //   • Stateless / recomputed, nothing to lose: `lineNumbers()`,
  //     `indentOnInput()`, `syntaxHighlighting()`, `keymap(defaultKeymap +
  //     historyKeymap)`, `glslGotoDefinition()`, `glslRename()`,
  //     `editorChromeTheme`, `EditorView.lineWrapping`.
  // The EditorView *instance* is deliberately unchanged — `setCurrentView` and
  // the E2E `__sp.codeEditor.getCursorLine()` bridge hold onto it.
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
    // Keep the identity when there is nothing to clear. Handing out a fresh
    // `[]` on every switch would re-fire the `[diags, stage, liveDiags]`
    // effect below unconditionally — a duplicate CM dispatch per switch, and
    // worse, an accidental safety net that hides whether the compensating
    // dispatch further down actually works (it would silently paper over its
    // removal). With this bail-out that effect only runs when the merged
    // diagnostic set can genuinely differ.
    if (switching) setLiveDiags((prev) => (prev.length === 0 ? prev : []));
    const extensions = extRef.current;
    if (switching && extensions) {
      view.setState(EditorState.create({ doc: source, extensions }));
      // Two compensating dispatches, because `setState` is not a transaction:
      // (1) reinstall + repopulate lint for the incoming document. Relying on
      //     the `[diags, stage, liveDiags]` effect to re-fire is not sound —
      //     switching between two nodes whose diagnosticsStore entry is the
      //     same reference (both absent, or literally the same object), on the
      //     same stage, changes none of its deps, and the `setLiveDiags` above
      //     deliberately preserves identity when it is already empty. The lint
      //     field itself did not survive `setState` (it is installed through
      //     `StateEffect.appendConfig`, so it is not in `extRef`), so without
      //     this dispatch the incoming document would carry no underlines at
      //     all. Pinned by "re-applies diagnostics when the switch changes no
      //     effect dependency" in `index.test.tsx`.
      view.dispatch(
        setDiagnostics(
          view.state,
          toCMDiagnostics(view, mergeDiagnostics(diagsRef.current, stage, [])),
        ),
      );
      // (2) kick the live validator by hand: `setState` produces no ViewUpdate,
      //     so `updateListener` (which normally drives it on every doc change,
      //     including the old reload dispatch) never sees this swap. `commit` is
      //     deliberately NOT called — the incoming text came *from* the store.
      liveValidateRef.current?.(source);
      return;
    }
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

  // Push diagnostics to CM (see `mergeDiagnostics`). The document-swap path
  // above runs the same merge with an empty live set, so the two never
  // disagree about what should be underlined.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const all = mergeDiagnostics(diags, stage, liveDiags);
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
      <DockPanelHeader meta="GLSL · ES 3.0" metaAlign="end" />
      {/* Stage-tab sub-strip (design/CHANGELOG.md §v2.0 Changed) — a direct
          `.panel` child, so the existing collapsed-rail rule
          (`.shell-slot--collapsed .panel > :not(.dock-header)`, index.css)
          hides it automatically along with the editor body; no extra
          isRail check needed here (unlike when it lived inside
          DockPanelHeader's children slot, gated by `!isRail`). */}
      <div className="code-stage-strip">
        <StageTabs
          active={stage}
          onChange={setStage}
          vertexHasError={vertexHasError}
          fragmentHasError={fragmentHasError}
        />
        {!isMulti && effectiveId && node && (
          <div className="code-stage-strip-meta">
            <span className="dock-header-divider" aria-hidden="true" />
            <NodeBreadcrumb name={displayNodeName(node)} kind={node.kind} />
          </div>
        )}
        <AutoOpenToggle />
      </div>
      <div className="panel-body">
        <div
          ref={containerRef}
          data-testid="code-editor"
          data-active-node={effectiveId ?? ""}
          data-active-stage={stage}
          style={{
            width: "100%",
            height: "100%",
            display: node && !isMulti ? "block" : "none",
          }}
        />
        {isMulti && (
          <MultiSelectBanner
            count={selectedIds.length}
            chips={multiSelectChips}
          />
        )}
        {!node && !isMulti && (
          <div className="placeholder-message">No shader node selected</div>
        )}
      </div>
    </div>
  );
}

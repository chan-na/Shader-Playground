import { insertNewlineAndIndent, undo } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { runScopeHandlers } from "@codemirror/view";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShaderGraphNode } from "../../core/graph/types";
import fullscreenVert from "../../shaders/fullscreen.vert?raw";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";
import { useDiagnosticsStore } from "../../state/diagnosticsStore";
import { useDockStore } from "../../state/dockStore";
import {
  createDefaultDockTree,
  type DockPath,
  findTabLeafPath,
  getNodeAt,
} from "../../state/dockTree";
import { useEditorStore } from "../../state/editorStore";
import { undoGraph, useGraphStore } from "../../state/graphStore";
import { useHistoryStore } from "../../state/historyStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { useSelectionStore } from "../../state/selectionStore";
import { deserializeProject } from "../../state/serialization";
import { DockLeafContext } from "../dockLeafContext";
import { getCurrentView } from "./currentView";
import { CodeEditor } from "./index";

const dockInitial = useDockStore.getState();

const VERT = "void main(){ gl_Position = vec4(0.0); }\n";
const FRAG = "out vec4 outColor;\nvoid main(){ outColor = vec4(1.0); }\n";

// A shader whose `u_amount` uniform is declared in BOTH stages — the shape a
// cross-stage F2 rename is supposed to rewrite on both sides at once.
const VERT_U = `#version 300 es
in vec3 a_position;
uniform float u_amount;

void main() {
  gl_Position = vec4(a_position * u_amount, 1.0);
}
`;
const FRAG_U = `#version 300 es
precision highp float;
uniform float u_amount;
out vec4 outColor;

void main() {
  outColor = vec4(u_amount, 0.0, 0.0, 1.0);
}
`;

/** `u_amount` -> `u_scale`, spelled without ES2021 `String.replaceAll`. */
function renamed(src: string): string {
  return src.split("u_amount").join("u_scale");
}

function shaderNode(id: string): ShaderGraphNode {
  return {
    id,
    kind: "shader",
    vertexSource: VERT,
    fragmentSource: FRAG,
    uniformValues: {},
  };
}

function codeLeaf(): { leafId: string; path: DockPath } {
  const { tree } = useDockStore.getState();
  if (tree === null) throw new Error("no dock tree");
  const path = findTabLeafPath(tree, "code");
  if (path === null) throw new Error("no code leaf");
  const node = getNodeAt(tree, path);
  if (node === null || node.type !== "leaf") throw new Error("not a leaf");
  return { leafId: node.id, path };
}

function mount() {
  const { leafId, path } = codeLeaf();
  return render(
    <DockLeafContext.Provider value={{ leafId, path }}>
      <CodeEditor />
    </DockLeafContext.Provider>,
  );
}

/** The mounted CodeMirror view (CodeEditor publishes it via setCurrentView). */
function view() {
  const v = getCurrentView();
  if (v === null) throw new Error("no editor view mounted");
  return v;
}

/** Let the 50ms commit debounce (and any React state it triggers) settle. */
async function settle(ms = 90) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Simulate a keystroke: the update listener only inspects `docChanged`, so a
 * plain change transaction is indistinguishable from real typing here. */
function type(text: string) {
  act(() => {
    view().dispatch({ changes: { from: 0, insert: text } });
  });
}

function node(id: string): ShaderGraphNode {
  const n = useGraphStore.getState().nodes.find((x) => x.id === id);
  if (!n || n.kind !== "shader") throw new Error(`no shader node ${id}`);
  return n;
}

/** Put the cursor on the first occurrence of `word` in the mounted doc. */
function putCursorOn(word: string) {
  const doc = view().state.doc.toString();
  const at = doc.indexOf(word);
  if (at < 0) throw new Error(`'${word}' not in the editor doc`);
  act(() => {
    view().dispatch({ selection: EditorSelection.cursor(at + 1) });
  });
}

/** Fire the F2 binding through the real keymap installed by glslExtensions. */
function pressF2() {
  const v = view();
  act(() => {
    runScopeHandlers(v, new KeyboardEvent("keydown", { key: "F2" }), "editor");
  });
}

beforeEach(() => {
  useDockStore.setState(
    { ...dockInitial, tree: createDefaultDockTree(), maximized: null },
    true,
  );
  useGraphStore.setState({
    nodes: [shaderNode("shader1")],
    edges: [],
    positions: {},
    parents: {},
  });
  useDiagnosticsStore.setState({ byNode: {} });
  useSelectionStore.getState().select("shader1");
  useEditorStore.setState({ activeStage: "fragment" });
});

afterEach(() => {
  cleanup();
  usePassPlanStore.getState().reset();
});

describe("CodeEditor mount", () => {
  it("mounts a real CodeMirror view with glslExtensions and loads the doc", () => {
    mount();
    expect(view().state.doc.toString()).toBe(FRAG);
  });

  it("binds to the first shader node when nothing is selected (#10)", () => {
    useGraphStore.setState({
      nodes: [shaderNode("shader1"), shaderNode("shader2")],
    });
    useSelectionStore.getState().select(null);
    const { container } = mount();
    const host = container.querySelector("[data-testid='code-editor']");
    expect(host?.getAttribute("data-active-node")).toBe("shader1");
    expect(view().state.doc.toString()).toBe(FRAG);
  });
});

describe("CodeEditor document switch (#1a)", () => {
  it("keeps committing typed text to the store after a stage switch", async () => {
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.doc.toString()).toBe(VERT);

    type("// typed\n");
    await settle();

    // The update listener MUST survive the document swap, otherwise every
    // keystroke after the first switch is silently dropped.
    expect(node("shader1").vertexSource).toBe(`// typed\n${VERT}`);
    expect(node("shader1").fragmentSource).toBe(FRAG);
  });

  it("keeps committing typed text to the store after a node switch", async () => {
    useGraphStore.setState({
      nodes: [shaderNode("shader1"), shaderNode("shader2")],
    });
    mount();
    await act(async () => {
      useSelectionStore.getState().select("shader2");
    });
    type("// two\n");
    await settle();

    expect(node("shader2").fragmentSource).toBe(`// two\n${FRAG}`);
    expect(node("shader1").fragmentSource).toBe(FRAG);
  });

  it("does not let undo after a stage switch resurrect the other stage's doc", async () => {
    mount();
    type("// edited\n");
    await settle();
    expect(node("shader1").fragmentSource).toBe(`// edited\n${FRAG}`);

    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.doc.toString()).toBe(VERT);

    // The switch replaces the whole EditorState, so the vertex doc starts with
    // an empty history — undo is a no-op instead of popping the *fragment*
    // document back into a vertex-stage editor (which would then commit the
    // fragment text as `vertexSource`).
    act(() => {
      undo(view());
    });
    await settle();

    expect(view().state.doc.toString()).toBe(VERT);
    expect(node("shader1").vertexSource).toBe(VERT);
    expect(node("shader1").fragmentSource).toBe(`// edited\n${FRAG}`);
  });

  it("re-applies the incoming node's diagnostics onto the swapped document", async () => {
    useGraphStore.setState({
      nodes: [shaderNode("shader1"), shaderNode("shader2")],
    });
    useDiagnosticsStore.setState({
      byNode: {
        shader2: {
          vertex: [],
          fragment: [
            { line: 1, column: 1, severity: "error", message: "boom" },
          ],
          link: [],
        },
      },
    });
    mount();
    expect(collectLint()).toEqual([]);

    await act(async () => {
      useSelectionStore.getState().select("shader2");
    });
    // End-state check only: here the store entry goes undefined -> object, so
    // the `[diags, stage, liveDiags]` effect re-fires on its own and would
    // repaint the underline even with the compensating dispatch removed. The
    // dispatch itself is pinned by the next test, which holds every one of
    // those deps referentially still.
    expect(collectLint()).toEqual(["boom"]);

    await act(async () => {
      useSelectionStore.getState().select("shader1");
    });
    expect(collectLint()).toEqual([]);
  });

  it("re-applies diagnostics when the switch changes no effect dependency", async () => {
    // Both nodes are mapped to the SAME NodeDiagnostics object, so across the
    // switch `diags` is referentially unchanged, `stage` is unchanged, and
    // `liveDiags` keeps its identity (the reload effect only re-seeds it when
    // it is non-empty). The `[diags, stage, liveDiags]` effect therefore never
    // runs, while `view.setState` has just dropped the lint field that
    // `setDiagnostics` appended. The reload effect's compensating dispatch is
    // the only thing left that can carry the underline onto the new document.
    const shared: NodeDiagnostics = {
      vertex: [],
      fragment: [{ line: 1, column: 1, severity: "error", message: "shared" }],
      link: [],
    };
    useGraphStore.setState({
      nodes: [shaderNode("shader1"), shaderNode("shader2")],
    });
    useDiagnosticsStore.setState({
      byNode: { shader1: shared, shader2: shared },
    });
    mount();
    expect(collectLint()).toEqual(["shared"]);

    await act(async () => {
      useSelectionStore.getState().select("shader2");
    });
    const host = document.querySelector("[data-testid='code-editor']");
    expect(host?.getAttribute("data-active-node")).toBe("shader2");
    expect(collectLint()).toEqual(["shared"]);
  });
});

/**
 * F22 — a project imported with CRLF line endings used to make the graph redo
 * stack unreachable.
 *
 * The store carried CRLF verbatim while CodeMirror normalises every document it
 * holds to LF, so the two could never compare equal. Undoing back across the
 * boundary re-loaded the CRLF source into the editor, CM normalised it, the
 * update listener committed the LF twin, and `updateShaderSource` pushed a
 * fresh history entry — which clears `future`. The redo the user had just
 * earned was gone before they could press it.
 *
 * These go through the REAL import path (`deserializeProject`), because that is
 * where the normalisation lives. Planting CRLF with `setState` would bypass the
 * fix entirely and pin nothing.
 */
describe("CodeEditor — imported CRLF source (F22)", () => {
  const FRAG_CRLF = FRAG.split("\n").join("\r\n");

  /** Load a one-shader project through deserialize + setGraph, as the file
   *  import / share URL / bootstrap paths all do. */
  function importProject(fragmentSource: string) {
    const parsed = deserializeProject({
      format: "shader-playground",
      version: 1,
      exportedAt: "2026-07-31T00:00:00.000Z",
      graph: {
        nodes: [
          {
            id: "shader1",
            kind: "shader",
            vertexSource: VERT,
            fragmentSource,
            uniformValues: {},
          },
        ],
        edges: [],
      },
      positions: {},
      parents: {},
    });
    act(() => {
      useGraphStore
        .getState()
        .setGraph(parsed.graph, parsed.positions, parsed.parents);
    });
    useHistoryStore.setState({ past: [], future: [] });
  }

  it("normalises the imported source so the store matches the editor doc", () => {
    importProject(FRAG_CRLF);
    mount();
    expect(node("shader1").fragmentSource).toBe(FRAG);
    expect(view().state.doc.toString()).toBe(FRAG);
  });

  it("keeps redo reachable after undoing an edit to an imported CRLF shader", async () => {
    importProject(FRAG_CRLF);
    mount();

    type("// edited\n");
    await settle();
    // One committed edit: `past` holds the pre-edit source, `future` is empty.
    expect(useHistoryStore.getState().past).toHaveLength(1);
    const edited = node("shader1").fragmentSource;
    expect(edited.startsWith("// edited\n")).toBe(true);

    act(() => {
      undoGraph();
    });
    await settle();

    // The undo itself must survive the reload effect: nothing may re-commit the
    // restored source, so redo stays available and the store stops moving.
    expect(useHistoryStore.getState().future).toHaveLength(1);
    expect(node("shader1").fragmentSource).toBe(FRAG);
    expect(view().state.doc.toString()).toBe(FRAG);
  });
});

describe("CodeEditor F2 rename target (#10)", () => {
  it("renames BOTH stages when nothing is selected and the panel auto-opened a node", async () => {
    // The regression this pins: with an empty selection the Code panel still
    // opens the first shader node, but `rename.ts` used to resolve its
    // cross-stage context from `selectionStore.selectedNodeId` alone. It found
    // nothing, fell back to the single-document path, and left the paired
    // stage on the old name — a half-renamed program, reported as success.
    useGraphStore.setState({
      nodes: [
        {
          id: "shader1",
          kind: "shader",
          vertexSource: VERT_U,
          fragmentSource: FRAG_U,
          uniformValues: {},
        },
      ],
    });
    useSelectionStore.getState().select(null);
    mount();
    expect(view().state.doc.toString()).toBe(FRAG_U);

    putCursorOn("u_amount");
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("u_scale");
    try {
      pressF2();
      // `mockRestore` below also clears the call log, so read it here: this
      // asserts F2 actually reached `runRename` rather than the test passing
      // because nothing happened at all.
      expect(prompt).toHaveBeenCalledTimes(1);
    } finally {
      prompt.mockRestore();
    }
    await settle();

    expect(node("shader1").fragmentSource).toBe(renamed(FRAG_U));
    expect(node("shader1").vertexSource).toBe(renamed(VERT_U));
    // The visible doc was rewritten in the same turn, so the reload effect's
    // M11 guard leaves the cursor alone instead of re-loading from the store.
    expect(view().state.doc.toString()).toBe(renamed(FRAG_U));
  });

  it("still renames both stages when the node IS selected", async () => {
    useGraphStore.setState({
      nodes: [
        {
          id: "shader1",
          kind: "shader",
          vertexSource: VERT_U,
          fragmentSource: FRAG_U,
          uniformValues: {},
        },
      ],
    });
    useSelectionStore.getState().select("shader1");
    mount();

    putCursorOn("u_amount");
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("u_scale");
    try {
      pressF2();
    } finally {
      prompt.mockRestore();
    }
    await settle();

    expect(node("shader1").vertexSource).toBe(renamed(VERT_U));
    expect(node("shader1").fragmentSource).toBe(renamed(FRAG_U));
  });
});

/**
 * A-1 — the vertex tab shows fullscreen.vert verbatim and is read-only for
 * any node `passPlanStore.fullscreenByNode` marks fullscreen (the mesh
 * input didn't resolve, so the compiler substituted it), and reverts the
 * instant that record says otherwise — no reselection required.
 */
describe("CodeEditor — A-1 auto-vertex readOnly", () => {
  it("shows fullscreen.vert verbatim + blocks editing when the node is plan-marked fullscreen", async () => {
    usePassPlanStore.getState().publish([], { shader1: true });
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.doc.toString()).toBe(fullscreenVert);
    expect(view().state.readOnly).toBe(true);

    // Not just the flag: the actual keymap-bound editing command (Enter)
    // must no-op, which is what makes typing genuinely ineffective.
    const before = view().state.doc.toString();
    let applied = true;
    act(() => {
      applied = insertNewlineAndIndent(view());
    });
    expect(applied).toBe(false);
    expect(view().state.doc.toString()).toBe(before);

    // And the store's real vertexSource must be untouched throughout.
    expect(node("shader1").vertexSource).toBe(VERT);
  });

  it("returns to the user's vertexSource + editable once the node stops being plan-marked fullscreen (no reselection)", async () => {
    usePassPlanStore.getState().publish([], { shader1: true });
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.doc.toString()).toBe(fullscreenVert);
    expect(view().state.readOnly).toBe(true);

    // Mesh connects (recompile flips this record) — same node, same stage,
    // no selection change. The dedicated `[isAutoVertex]` effect is the only
    // thing that can catch this.
    await act(async () => {
      usePassPlanStore.getState().publish([], { shader1: false });
    });

    expect(view().state.doc.toString()).toBe(VERT);
    expect(view().state.readOnly).toBe(false);

    let applied = false;
    act(() => {
      applied = insertNewlineAndIndent(view());
    });
    expect(applied).toBe(true);
    await settle();
    // The fullscreen.vert text the tab showed a moment ago must never have
    // reached the store as this node's "real" vertexSource (A-1 commit
    // guard) — only the just-typed edit did.
    expect(node("shader1").vertexSource.includes(fullscreenVert)).toBe(false);
  });

  it("shows the neutral auto-vertex note while the substituted doc is on screen", async () => {
    usePassPlanStore.getState().publish([], { shader1: true });
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    // Cause-neutral wording: the substitution also fires when a mesh edge
    // exists but doesn't resolve (asset unloaded / compute pass failed), so
    // the note must not claim the input is missing ("미연결").
    expect(screen.getByTestId("vertex-auto-note").textContent).toBe(
      "mesh 입력이 해석되지 않아 fullscreen.vert가 대신 실행됩니다 (읽기 전용)",
    );
  });

  it("advertises the auto vertex doc on the tab while the FRAGMENT stage is active", async () => {
    // editorStore defaults to "fragment" (see beforeEach), which is exactly
    // the state a fullscreen node is first selected in. The tab label states
    // a fact about the vertex *document* — it must already be honest here,
    // while everything stage-scoped (source override, readOnly, note) still
    // applies to the visible fragment document only.
    usePassPlanStore.getState().publish([], { shader1: true });
    mount();
    const vertexTab = screen.getByTestId("stage-tab-vertex");
    expect(vertexTab.getAttribute("data-active")).toBe("false");
    expect(vertexTab.getAttribute("data-auto")).toBe("true");
    expect(vertexTab.textContent).toBe("fullscreen.vert (auto)");
    // Stage-scoped behavior untouched: the on-screen doc is the user's
    // fragment source, editable, with no auto-vertex note.
    expect(view().state.doc.toString()).toBe(FRAG);
    expect(view().state.readOnly).toBe(false);
    expect(screen.queryByTestId("vertex-auto-note")).toBeNull();
  });

  it("editor undo cannot resurrect fullscreen.vert after a disconnect→reconnect round-trip", async () => {
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.doc.toString()).toBe(VERT);

    // Mesh disconnects: the auto flip swaps fullscreen.vert into the doc.
    await act(async () => {
      usePassPlanStore.getState().publish([], { shader1: true });
    });
    expect(view().state.doc.toString()).toBe(fullscreenVert);

    // Sit out CM's history newGroupDelay (500ms): at user speed the two
    // swap transactions are NOT adjacent-grouped, so if they were recorded
    // in history at all, undo would pop only the second one — turning the
    // doc into fullscreen.vert instead of harmlessly reverting both.
    await settle(600);

    // Mesh reconnects: the user's source returns, editable again.
    await act(async () => {
      usePassPlanStore.getState().publish([], { shader1: false });
    });
    expect(view().state.doc.toString()).toBe(VERT);
    expect(view().state.readOnly).toBe(false);

    // Cmd+Z: both swaps were dispatched with addToHistory(false), so there
    // is nothing to undo. Without that annotation this pops the
    // fullscreen.vert→VERT replacement, and the 50ms commit then passes the
    // A-1 guard (the plan already says "not fullscreen") and writes
    // fullscreen.vert into the store as shader1's real vertexSource.
    let applied = true;
    act(() => {
      applied = undo(view());
    });
    await settle();
    expect(applied).toBe(false);
    expect(view().state.doc.toString()).toBe(VERT);
    expect(node("shader1").vertexSource).toBe(VERT);
  });

  it("keeps readOnly across a switch between two fullscreen-marked nodes (compensating-dispatch regression guard)", async () => {
    useGraphStore.setState({
      nodes: [shaderNode("shader1"), shaderNode("shader2")],
    });
    usePassPlanStore.getState().publish([], { shader1: true, shader2: true });
    mount();
    await act(async () => {
      useEditorStore.getState().setStage("vertex");
    });
    expect(view().state.readOnly).toBe(true);
    expect(view().state.doc.toString()).toBe(fullscreenVert);

    // isAutoVertex is `true` both before and after this switch, so the
    // dedicated `[isAutoVertex]` effect's dependency never changes and it
    // never re-fires. Only the reload effect's own compensating dispatch —
    // which `setState` otherwise leaves undone, since `setState` resets the
    // `ro` compartment back to its mount-time `false` — can restore
    // readOnly for node B's document.
    await act(async () => {
      useSelectionStore.getState().select("shader2");
    });
    expect(view().state.doc.toString()).toBe(fullscreenVert);
    expect(view().state.readOnly).toBe(true);
  });
});

function collectLint(): string[] {
  const out: string[] = [];
  forEachDiagnostic(view().state, (d) => {
    out.push(d.message);
  });
  return out;
}

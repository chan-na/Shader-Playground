import { undo } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { runScopeHandlers } from "@codemirror/view";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShaderGraphNode } from "../../core/graph/types";
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
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
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

function collectLint(): string[] {
  const out: string[] = [];
  forEachDiagnostic(view().state, (d) => {
    out.push(d.message);
  });
  return out;
}

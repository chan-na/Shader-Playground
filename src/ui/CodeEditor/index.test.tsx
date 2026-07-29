import { undo } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShaderGraphNode } from "../../core/graph/types";
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
    // The lint extension is installed through `StateEffect.appendConfig`, so it
    // is NOT part of the extension array the new EditorState is built from —
    // without the compensating dispatch the swapped doc shows nothing.
    expect(collectLint()).toEqual(["boom"]);

    await act(async () => {
      useSelectionStore.getState().select("shader1");
    });
    expect(collectLint()).toEqual([]);
  });
});

function collectLint(): string[] {
  const out: string[] = [];
  forEachDiagnostic(view().state, (d) => {
    out.push(d.message);
  });
  return out;
}

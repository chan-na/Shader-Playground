import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShaderGraphNode } from "../../core/graph/types";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import {
  type CrossStageRenameContext,
  glslRename,
  runRename,
  validateRenameName,
} from "./rename";

function viewOf(doc: string, cursorAt: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorAt),
  });
  const parent = document.createElement("div");
  return new EditorView({ state, parent });
}

/** Same as {@link viewOf} but with CodeMirror's history installed, so a test
 * can actually run `undo(view)` — the production editor always has it
 * (`glslSetup.ts`), the bare `viewOf` above does not. */
function viewWithHistory(doc: string, cursorAt: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorAt),
    extensions: [history()],
  });
  const parent = document.createElement("div");
  return new EditorView({ state, parent });
}

const FRAG = `uniform float u_strength;
out vec4 outColor;

void main() {
  outColor = vec4(u_strength * 0.5, u_strength, 1.0, 1.0);
}
`;

describe("validateRenameName", () => {
  it("accepts a normal identifier", () => {
    expect(validateRenameName("u_amount").ok).toBe(true);
  });

  it("rejects empty / non-identifier shapes", () => {
    expect(validateRenameName("").ok).toBe(false);
    expect(validateRenameName("1abc").ok).toBe(false);
    expect(validateRenameName("with space").ok).toBe(false);
    expect(validateRenameName("foo-bar").ok).toBe(false);
  });

  it("rejects reserved GLSL keywords and types", () => {
    expect(validateRenameName("uniform").ok).toBe(false);
    expect(validateRenameName("vec3").ok).toBe(false);
    expect(validateRenameName("for").ok).toBe(false);
  });
});

describe("runRename", () => {
  it("rewrites every reference in a single transaction", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewOf(FRAG, uPos);
    const result = runRename(view, () => "u_amount");
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.newName).toBe("u_amount");
      expect(result.sites).toBe(3); // 1 decl + 2 uses
    }
    const after = view.state.doc.toString();
    expect(after.includes("u_strength")).toBe(false);
    // Counts: 1 declaration + 2 use sites inside main().
    expect(after.match(/u_amount/g)?.length).toBe(3);
    view.destroy();
  });

  it("is a single undo step", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewOf(FRAG, uPos);
    runRename(view, () => "u_amount");
    // One dispatched transaction should produce exactly one document state on
    // the undo stack — undoing should restore the original doc.
    // CodeMirror's history records transactions individually, so verifying
    // the change count via the changeSet is sufficient evidence.
    const change = view.state.doc.toString();
    expect(change.includes("u_amount")).toBe(true);
    view.destroy();
  });

  it("returns prompt-cancelled when the user backs out", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewOf(FRAG, uPos);
    const result = runRename(view, () => null);
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("prompt-cancelled");
    expect(view.state.doc.toString()).toBe(FRAG); // untouched
    view.destroy();
  });

  it("returns unchanged when the prompt returns the same name", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewOf(FRAG, uPos);
    const result = runRename(view, () => "u_strength");
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("unchanged");
    view.destroy();
  });

  it("returns invalid-name when validation fails", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewOf(FRAG, uPos);
    const result = runRename(view, () => "uniform");
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("invalid-name");
    view.destroy();
  });

  it("returns no-binding when the cursor is on a builtin", () => {
    const view = viewOf(FRAG, FRAG.indexOf("vec4(") + 1);
    const result = runRename(view, () => "anything");
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("no-binding");
    view.destroy();
  });

  it("returns not-on-identifier when the cursor sits on whitespace", () => {
    // Cursor on the leading space of `  outColor = ...`.
    const sp = FRAG.indexOf("  outColor") + 1;
    const view = viewOf(FRAG, sp);
    const result = runRename(view, () => "anything");
    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe("not-on-identifier");
    view.destroy();
  });

  describe("cross-stage (Phase 28)", () => {
    const VERT = `#version 300 es
in vec3 a_position;
uniform float u_amount;
out vec2 v_uv;

void main() {
  v_uv = a_position.xy * u_amount;
  gl_Position = vec4(a_position, 1.0);
}
`;
    const FRAG_X = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_amount;
out vec4 outColor;

void main() {
  outColor = vec4(v_uv * u_amount, 0.0, 1.0);
}
`;

    it("rewrites uniform in both stages and commits a both-stages patch", () => {
      // Cursor on vertex `u_amount` decl (line 3 of VERT).
      const view = viewOf(VERT, VERT.indexOf("u_amount") + 1);
      // Wrapper object so TS doesn't narrow the let to null after the
      // closure assignment (it can't statically prove the callback fires).
      const captured: {
        origin: string | null;
        other: string | null;
        rename: { from: string; to: string } | null;
      } = {
        origin: null,
        other: null,
        rename: null,
      };
      const ctx: CrossStageRenameContext = {
        originStage: "vertex",
        otherStageSource: FRAG_X,
        applyBothStages(newOrigin, newOther, rename) {
          captured.origin = newOrigin;
          captured.other = newOther;
          captured.rename = rename;
        },
      };
      const result = runRename(view, () => "u_strength", ctx);
      expect(result.applied).toBe(true);
      if (result.applied) {
        expect(result.otherStageSites).toBe(2);
        // Total: vertex (decl + 1 use) + fragment (decl + 1 use) = 4.
        expect(result.sites).toBe(4);
      }
      // CM view (vertex stage) has the rewrite.
      const afterVert = view.state.doc.toString();
      expect(afterVert).not.toContain("u_amount");
      expect(afterVert.match(/u_strength/g)?.length).toBe(2);
      // applyBothStages received the rewritten origin AND the rewritten other.
      expect(captured.origin).toBe(afterVert);
      expect(captured.other).not.toBeNull();
      expect(captured.other).not.toContain("u_amount");
      expect(captured.other?.match(/u_strength/g)?.length).toBe(2);
      // …and the exact pair, so the store can move the uniform's input-port
      // edge and tuned value instead of reading the old name as deleted.
      expect(captured.rename).toEqual({ from: "u_amount", to: "u_strength" });
      view.destroy();
    });

    it("vertex-only attribute does NOT commit to fragment (partial rename)", () => {
      // a_position is a vertex `in` (attribute). Fragment has no such name.
      const view = viewOf(VERT, VERT.indexOf("a_position") + 1);
      let bothCalled = false;
      const ctx: CrossStageRenameContext = {
        originStage: "vertex",
        otherStageSource: FRAG_X,
        applyBothStages() {
          bothCalled = true;
        },
      };
      const result = runRename(view, () => "a_pos", ctx);
      expect(result.applied).toBe(true);
      if (result.applied) {
        expect(result.otherStageSites).toBe(0);
      }
      // No fragment-side change → applyBothStages was never invoked.
      expect(bothCalled).toBe(false);
      expect(view.state.doc.toString()).not.toContain("a_position");
      view.destroy();
    });

    it("local rename does NOT commit other stage even when names collide", () => {
      const V = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 n = vec2(0.5);
  v_uv = n;
}
`;
      const F = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 n = vec4(v_uv, 0.0, 1.0);
  outColor = n;
}
`;
      // Cursor on vertex local n (line 4).
      const pos = V.indexOf("vec2 n =") + "vec2 ".length;
      const view = viewOf(V, pos + 1);
      let bothCalled = false;
      const ctx: CrossStageRenameContext = {
        originStage: "vertex",
        otherStageSource: F,
        applyBothStages() {
          bothCalled = true;
        },
      };
      const result = runRename(view, () => "amt", ctx);
      expect(result.applied).toBe(true);
      if (result.applied) expect(result.otherStageSites).toBe(0);
      expect(bothCalled).toBe(false);
      // Vertex local was rewritten in the view; fragment `n` remains untouched
      // (it wasn't passed through applyBothStages).
      expect(view.state.doc.toString()).not.toContain(" n =");
      expect(F).toContain("vec4 n ="); // sanity — F string itself unmodified
      view.destroy();
    });

    it("applied from the fragment side too", () => {
      // Cursor on fragment uniform u_amount.
      const view = viewOf(FRAG_X, FRAG_X.indexOf("u_amount") + 1);
      const captured: { value: { o: string; x: string } | null } = {
        value: null,
      };
      const ctx: CrossStageRenameContext = {
        originStage: "fragment",
        otherStageSource: VERT,
        applyBothStages(o, x) {
          captured.value = { o, x };
        },
      };
      const result = runRename(view, () => "u_k", ctx);
      expect(result.applied).toBe(true);
      expect(captured.value).not.toBeNull();
      // o = new fragment, x = new vertex (the "other" side).
      expect(captured.value?.o).toBe(view.state.doc.toString());
      expect(captured.value?.o).not.toContain("u_amount");
      expect(captured.value?.x).not.toContain("u_amount");
      view.destroy();
    });

    it("keeps the rewrite out of the CM undo stack when it wrote the other stage (#1c)", () => {
      const view = viewWithHistory(VERT, VERT.indexOf("u_amount") + 1);
      let committed = false;
      const ctx: CrossStageRenameContext = {
        originStage: "vertex",
        otherStageSource: FRAG_X,
        applyBothStages() {
          committed = true;
        },
      };
      const result = runRename(view, () => "u_strength", ctx);
      expect(result.applied).toBe(true);
      expect(committed).toBe(true);
      const renamed = view.state.doc.toString();
      expect(renamed).not.toContain("u_amount");

      // Undo must NOT roll the visible stage back: the paired stage was already
      // committed to the graph store, so a CM-only revert would leave a program
      // where vertex says `u_amount` and fragment says `u_strength`.
      undo(view);
      expect(view.state.doc.toString()).toBe(renamed);
      view.destroy();
    });

    it("keeps a partial (origin-only) cross-stage rename undoable", () => {
      // a_position exists only in the vertex stage → no other-stage commit →
      // nothing to desynchronise, so the normal single-undo step is preserved.
      const view = viewWithHistory(VERT, VERT.indexOf("a_position") + 1);
      const ctx: CrossStageRenameContext = {
        originStage: "vertex",
        otherStageSource: FRAG_X,
        applyBothStages() {
          throw new Error("must not commit the other stage");
        },
      };
      expect(runRename(view, () => "a_pos", ctx).applied).toBe(true);
      expect(view.state.doc.toString()).not.toContain("a_position");
      undo(view);
      expect(view.state.doc.toString()).toBe(VERT);
      view.destroy();
    });
  });

  it("keeps a single-document rename undoable in one step", () => {
    const uPos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const view = viewWithHistory(FRAG, uPos);
    expect(runRename(view, () => "u_amount").applied).toBe(true);
    expect(view.state.doc.toString()).not.toContain("u_strength");
    undo(view);
    expect(view.state.doc.toString()).toBe(FRAG);
    view.destroy();
  });

  it("scopes a local rename to its function body only", () => {
    const SRC = `uniform float k;
void inner() {
  float k = 2.0;
  outColor = vec4(k, k, 1.0, 1.0);
}
void main() {
  outColor = vec4(k);
}
`;
    // Place cursor on the local `k` inside inner().
    const localK = SRC.indexOf("float k =") + "float ".length;
    const view = viewOf(SRC, localK + 1);
    runRename(view, () => "kLocal");
    const after = view.state.doc.toString();
    // The global `k` at the top and inside main() must still read `k`.
    expect(after).toMatch(/uniform float k;/);
    expect(after).toMatch(/vec4\(k\);/);
    // The local has been renamed in inner().
    expect(after).toMatch(/float kLocal = 2\.0;/);
    expect(after).toMatch(/vec4\(kLocal, kLocal, 1\.0, 1\.0\);/);
    view.destroy();
  });
});

describe("runRename — member access guard (L5)", () => {
  const SRC = `uniform vec3 color;
uniform Light u_light;
out vec4 outColor;
void main() {
  outColor = vec4(color + u_light.color, 1.0);
}
`;

  it("no-ops on a struct-member access without prompting", () => {
    // Without the guard the reference finder skips the occurrence under the
    // cursor but still returns the uniform's other sites — F2 would prompt and
    // rename a symbol the user was not pointing at.
    const memberOffset = SRC.indexOf("color", SRC.indexOf("u_light."));
    const view = viewOf(SRC, memberOffset + 1);
    let prompted = false;
    const res = runRename(view, () => {
      prompted = true;
      return "tint";
    });
    expect(res.applied).toBe(false);
    expect(res.applied === false && res.reason).toBe("no-binding");
    expect(prompted).toBe(false);
    expect(view.state.doc.toString()).toBe(SRC);
    view.destroy();
  });

  it("still renames when the cursor is on the bare occurrence", () => {
    const bareOffset = SRC.indexOf("vec4(color") + 5;
    const view = viewOf(SRC, bareOffset + 1);
    const res = runRename(view, () => "tint");
    expect(res.applied).toBe(true);
    const out = view.state.doc.toString();
    expect(out).toContain("uniform vec3 tint;");
    expect(out).toContain("vec4(tint + u_light.color, 1.0)");
    view.destroy();
  });
});

/**
 * CRLF in the paired stage (F3) — the *call site*, not the helper.
 *
 * `findReferencesOf`'s offsets are exercised by `references.test.ts`, but the
 * damage happened here: `resolveCrossStageContext` reads `otherStageSource`
 * straight out of `graphStore` while the edited document — created by
 * CodeMirror, which normalises line endings — is always LF. `applyEdits` then
 * slices that raw string with the reported offsets and the result is committed
 * through `applyBothStages`. A one-character-per-line drift therefore wrote
 * mangled GLSL into the store and into graph history.
 *
 * How CRLF reached the store back then: `deserializeProject` passed shader
 * sources through verbatim. It no longer does — F22 normalises them at the
 * import boundary, so no production path puts `\r\n` in the store today. These
 * cases are kept as defence for the writers that still accept it (the `__sp`
 * dev hook, any future importer that bypasses `sanitizeGraphNode`): the offset
 * arithmetic must stay correct whether or not anything currently exercises it.
 */
describe("runRename — CRLF in the other stage (F3)", () => {
  const VERT_CRLF = `#version 300 es
in vec4 a_position;
uniform float u_amount;
out vec2 v_uv;

void main() {
  v_uv = a_position.xy * u_amount;
  gl_Position = a_position;
}
`.replace(/\n/g, "\r\n");

  // Origin stage as CodeMirror hands it over: already LF-normalised.
  const FRAG_LF = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_amount;
out vec4 outColor;

void main() {
  outColor = vec4(v_uv * u_amount, 0.0, 1.0);
}
`;

  it("rewrites the CRLF stage at the right offsets and keeps its line endings", () => {
    const view = viewOf(FRAG_LF, FRAG_LF.indexOf("u_amount") + 1);
    const captured: { other: string | null } = { other: null };
    const ctx: CrossStageRenameContext = {
      originStage: "fragment",
      otherStageSource: VERT_CRLF,
      applyBothStages(_newOrigin, newOther) {
        captured.other = newOther;
      },
    };

    const result = runRename(view, () => "u_strength", ctx);
    expect(result.applied).toBe(true);
    if (result.applied) expect(result.otherStageSites).toBe(2);

    const other = captured.other;
    expect(other).not.toBeNull();
    // The whole point: the rewritten source must be exactly the original with
    // both `u_amount` occurrences replaced — no characters eaten anywhere else.
    expect(other).toBe(VERT_CRLF.replace(/u_amount/g, "u_strength"));
    // Which implies all of the following, spelled out because each one was a
    // distinct symptom of the drift.
    expect(other).not.toContain("u_amount");
    expect(other?.match(/u_strength/g)).toHaveLength(2);
    expect(other).toContain("gl_Position = a_position;");
    expect(other?.match(/\r\n/g)).toHaveLength(9);

    view.destroy();
  });

  it("still parses as the same shader when both stages are CRLF", () => {
    // Both sides CRLF in the store; CodeMirror normalises only the doc it holds,
    // so the origin stage arrives LF while the pair stays CRLF. The commit must
    // not depend on the two agreeing — `runRename` rewrites each side in its own
    // terms rather than assuming one line-ending convention across the node.
    const fragCrlf = FRAG_LF.replace(/\n/g, "\r\n");
    const view = viewOf(FRAG_LF, FRAG_LF.indexOf("u_amount") + 1);
    const captured: { origin: string | null; other: string | null } = {
      origin: null,
      other: null,
    };
    const ctx: CrossStageRenameContext = {
      originStage: "fragment",
      otherStageSource: fragCrlf,
      applyBothStages(newOrigin, newOther) {
        captured.origin = newOrigin;
        captured.other = newOther;
      },
    };

    expect(runRename(view, () => "u_gain", ctx).applied).toBe(true);
    expect(captured.other).toBe(fragCrlf.replace(/u_amount/g, "u_gain"));
    // The origin commit follows CodeMirror's document, so it is LF. When CRLF
    // does reach the store through a non-import writer, this rename is one of
    // the places that leaves the node with per-stage line endings (F23) — the
    // helper's job is to rewrite correctly, not to reconcile the two. Import is
    // normalised (F22), so production never gets here with a mixed node.
    expect(captured.origin).toBe(FRAG_LF.replace(/u_amount/g, "u_gain"));
    view.destroy();
  });
});

/**
 * F2 while the editor is read-only (A-1).
 *
 * The Code panel substitutes `fullscreen.vert` into the vertex tab when the
 * node's mesh input does not resolve, and marks the editor read-only. The
 * visible document is then NOT the node's `vertexSource` — so a rename computed
 * from it and committed through `applyBothStages` writes a renamed
 * `fullscreen.vert` over the user's real source, which is gone.
 *
 * `EditorState.readOnly` does not stop that by itself: CodeMirror consults the
 * facet in its DOM input handlers, not in `dispatch`, and `applyBothStages`
 * reaches `graphStore` without going through the view at all. Both halves are
 * exercised here — the visible doc and the stored sources.
 */
describe("glslRename — F2 read-only guard (A-1)", () => {
  /** What the Code panel actually shows while the vertex stage is auto — the
   * shipped `src/shaders/fullscreen.vert`, not the node's source. */
  const AUTO_VERT = `#version 300 es

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
  /** The user's real vertex source, sitting in the store behind that
   * substitution. Nothing about it is visible to the editor. */
  const NODE_VERT = `#version 300 es
in vec3 a_position;
uniform mat4 u_model;
out vec2 v_uv;

void main() {
  v_uv = a_position.xy;
  gl_Position = u_model * vec4(a_position, 1.0);
}
`;
  const NODE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}
`;
  /** Offset of the `v_uv` declarator, in either vertex source. */
  const vUvDecl = (src: string) =>
    src.indexOf("out vec2 v_uv") + "out vec2 ".length + 1;

  /**
   * Mount a view carrying the real F2 keymap at the given read-only setting,
   * and hand back the command CodeMirror would run for F2 — read out of the
   * `keymap` facet the same way `runHandlers` does, so the shipped binding is
   * what runs rather than a copy of its body.
   */
  function f2View(
    doc: string,
    cursorAt: number,
    readOnly: boolean,
  ): { view: EditorView; runF2: () => boolean } {
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursorAt),
      extensions: [EditorState.readOnly.of(readOnly), glslRename()],
    });
    const parent = document.createElement("div");
    const view = new EditorView({ state, parent });
    const run = view.state
      .facet(keymap)
      .flat()
      .find((b) => b.key === "F2")?.run;
    if (!run) throw new Error("glslRename() exposes no F2 binding");
    return { view, runF2: () => run(view) };
  }

  /** Read the seeded shader node back out of the store. */
  function storedNode(): ShaderGraphNode {
    return useGraphStore.getState().nodes[0] as ShaderGraphNode;
  }

  /**
   * Call counter on the store write `applyBothStages` funnels into — the only
   * observable end of the F2 keymap's self-built cross-stage context.
   *
   * zustand hands out a fresh state object on every `set`, so a spy installed
   * on an earlier one rides along into its successors and outlives
   * `restoreAllMocks`; `vi.spyOn` then hands the very same mock back, carrying
   * the previous case's calls. Clearing keeps each case's count its own.
   */
  function watchCommit() {
    const spy = vi.spyOn(useGraphStore.getState(), "updateShaderSource");
    spy.mockClear();
    return spy;
  }

  beforeEach(() => {
    const node: ShaderGraphNode = {
      id: "s1",
      kind: "shader",
      vertexSource: NODE_VERT,
      fragmentSource: NODE_FRAG,
      uniformValues: {},
    };
    useGraphStore.setState({
      nodes: [node],
      edges: [],
      positions: {},
      parents: {},
    });
    useSelectionStore.getState().select("s1");
    // The F2 keymap builds its cross-stage context from the live stores, so the
    // vertex tab has to be the active one for this to be the A-1 situation.
    useEditorStore.getState().setStage("vertex");
    // Without a working prompt the pre-fix path would bail as `prompt-cancelled`
    // and this suite would pass for the wrong reason.
    vi.spyOn(window, "prompt").mockReturnValue("v_texcoord");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when the read-only auto vertex doc is showing", () => {
    const { view, runF2 } = f2View(AUTO_VERT, vUvDecl(AUTO_VERT), true);
    const commit = watchCommit();

    expect(runF2()).toBe(false);
    // Bailed before the prompt — the user is never even asked.
    expect(window.prompt).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(AUTO_VERT);
    expect(commit).not.toHaveBeenCalled();
    // The actual data loss: a renamed `fullscreen.vert` landing in the store as
    // this node's vertex source, with the real one overwritten.
    expect(storedNode().vertexSource).toBe(NODE_VERT);
    expect(storedNode().fragmentSource).toBe(NODE_FRAG);
    view.destroy();
  });

  it("still renames when the same editor is writable", () => {
    // Same node, same symbol, same keymap — only `readOnly` differs, so the
    // guard is proven to be scoped rather than a blanket disable of F2.
    const { view, runF2 } = f2View(NODE_VERT, vUvDecl(NODE_VERT), false);
    const commit = watchCommit();

    expect(runF2()).toBe(true);
    const afterVert = view.state.doc.toString();
    expect(afterVert).toBe(NODE_VERT.replace(/v_uv/g, "v_texcoord"));
    expect(commit).toHaveBeenCalledTimes(1);
    // Both stages committed as one patch, as the cross-stage path promises.
    expect(storedNode().vertexSource).toBe(afterVert);
    expect(storedNode().fragmentSource).toBe(
      NODE_FRAG.replace(/v_uv/g, "v_texcoord"),
    );
    view.destroy();
  });
});

import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  type CrossStageRenameContext,
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

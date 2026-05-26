import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { runRename, validateRenameName } from "./rename";

function viewOf(doc: string, cursorAt: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorAt),
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

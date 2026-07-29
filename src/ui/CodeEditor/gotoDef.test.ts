import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { findDefinitionAt, gotoDefinition } from "./gotoDef";

function viewOf(doc: string): EditorView {
  const state = EditorState.create({ doc });
  const parent = document.createElement("div");
  return new EditorView({ state, parent });
}

const FRAG = `#version 300 es
precision highp float;
uniform float u_strength;
out vec4 outColor;

float square(float x) {
  return x * x;
}

void main() {
  outColor = vec4(square(u_strength));
}
`;

describe("findDefinitionAt", () => {
  it("resolves a uniform use back to its declaration line", () => {
    const view = viewOf(FRAG);
    // Find the `u_strength` use in main() at the call site.
    const useOffset = FRAG.indexOf("u_strength", FRAG.indexOf("square("));
    const def = findDefinitionAt(view, useOffset + 1);
    expect(def).not.toBeNull();
    expect(def?.line).toBe(3);
    // The returned `from` points at the start of `u_strength` on line 3.
    expect(FRAG.slice(def!.from, def!.to)).toBe("u_strength");
    view.destroy();
  });

  it("resolves a function call site to its declaration", () => {
    const view = viewOf(FRAG);
    const callOffset = FRAG.indexOf("square(u_strength");
    const def = findDefinitionAt(view, callOffset + 1);
    expect(def?.line).toBe(6);
    expect(FRAG.slice(def!.from, def!.to)).toBe("square");
    view.destroy();
  });

  it("resolves a parameter use inside the function body", () => {
    const view = viewOf(FRAG);
    // `x * x` on line 7 — pick the first `x`.
    const xOffset = FRAG.indexOf("return x") + "return ".length;
    const def = findDefinitionAt(view, xOffset);
    expect(def?.line).toBe(6); // parameter declared on the header line
    expect(FRAG.slice(def!.from, def!.to)).toBe("x");
    view.destroy();
  });

  it("returns null for a builtin (no source-level declaration)", () => {
    const view = viewOf(FRAG);
    const sinOffset = FRAG.indexOf("vec4(");
    const def = findDefinitionAt(view, sinOffset + 1);
    // `vec4` is a type keyword — not in the symbol table.
    expect(def).toBeNull();
    view.destroy();
  });

  it("returns null when the cursor isn't on an identifier", () => {
    const view = viewOf(FRAG);
    // Place pos on a space.
    const spaceOffset = FRAG.indexOf("  return") + 1;
    const def = findDefinitionAt(view, spaceOffset);
    expect(def).toBeNull();
    view.destroy();
  });
});

describe("gotoDefinition", () => {
  it("dispatches a selection + scroll to the declaration", () => {
    const view = viewOf(FRAG);
    const useOffset = FRAG.indexOf("u_strength", FRAG.indexOf("square("));
    const ok = gotoDefinition(view, useOffset + 1);
    expect(ok).toBe(true);
    // After jump, the cursor sits at the declaration of u_strength on line 3.
    const head = view.state.selection.main.head;
    const lineAtHead = view.state.doc.lineAt(head);
    expect(lineAtHead.number).toBe(3);
    expect(view.state.doc.sliceString(head, head + "u_strength".length)).toBe(
      "u_strength",
    );
    view.destroy();
  });

  it("returns false when no definition is in scope", () => {
    const view = viewOf(FRAG);
    // Cursor over the `vec4` type keyword.
    const ok = gotoDefinition(view, FRAG.indexOf("vec4(") + 1);
    expect(ok).toBe(false);
    view.destroy();
  });
});

describe("findDefinitionAt — member access guard (L5)", () => {
  it("returns null on a swizzle letter that collides with a global", () => {
    const src = `uniform float x;
out vec4 outColor;
void main() {
  vec3 v = vec3(x);
  outColor = vec4(v.x, 1.0, 1.0, 1.0);
}
`;
    const view = viewOf(src);
    const swizzle = src.indexOf("v.x") + 2;
    expect(findDefinitionAt(view, swizzle)).toBeNull();
    // The bare `x` argument still jumps to the uniform declaration.
    const bare = src.indexOf("vec3(x)") + 5;
    expect(findDefinitionAt(view, bare)?.line).toBe(1);
    view.destroy();
  });
});

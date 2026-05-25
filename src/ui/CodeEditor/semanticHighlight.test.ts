import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { buildSemanticDecorations } from "./semanticHighlight";

/**
 * Construct an EditorView with `doc` and a single visible range covering the
 * full document. CodeMirror's ViewPlugin path normally manages viewport
 * sizing for us, but for a unit test we can wire up a view directly — its
 * default `visibleRanges` after construction is `[{from: 0, to: doc.length}]`
 * which is what we want.
 */
function viewOf(doc: string): EditorView {
  const state = EditorState.create({ doc });
  // Mount into a detached element — jsdom is fine with this; we never attach
  // to the document, and we don't drive layout-sensitive code paths.
  const parent = document.createElement("div");
  return new EditorView({ state, parent });
}

describe("buildSemanticDecorations", () => {
  it("returns Decoration.none for an empty document", () => {
    const view = viewOf("");
    const set = buildSemanticDecorations(view);
    expect(set.size).toBe(0);
    view.destroy();
  });

  it("emits one decoration per classified identifier", () => {
    const src = `uniform float u_time;
void main() {
  float a = sin(u_time);
}
`;
    const view = viewOf(src);
    const set = buildSemanticDecorations(view);
    // Expected tokens (in document order):
    //   1. u_time (decl)     — system-uniform
    //   2. main (fn header)  — function-user
    //   3. sin (call)        — function-builtin
    //   4. u_time (use)      — system-uniform
    expect(set.size).toBe(4);

    // Iterate through ranges and assert each one's class + slice.
    const ranges: Array<{ from: number; to: number; cls: string }> = [];
    const cur = set.iter();
    while (cur.value) {
      const value = cur.value as unknown as { spec: { class: string } };
      ranges.push({ from: cur.from, to: cur.to, cls: value.spec.class });
      cur.next();
    }
    const slice = (i: number) => src.slice(ranges[i]!.from, ranges[i]!.to);
    expect([slice(0), ranges[0]!.cls]).toEqual([
      "u_time",
      "cm-glsl-token-system-uniform",
    ]);
    expect([slice(1), ranges[1]!.cls]).toEqual([
      "main",
      "cm-glsl-token-function-user",
    ]);
    expect([slice(2), ranges[2]!.cls]).toEqual([
      "sin",
      "cm-glsl-token-function-builtin",
    ]);
    expect([slice(3), ranges[3]!.cls]).toEqual([
      "u_time",
      "cm-glsl-token-system-uniform",
    ]);
    view.destroy();
  });

  it("reuses the same Decoration instance per kind (cache)", () => {
    const src = `uniform float u_a;
uniform float u_b;
`;
    const view = viewOf(src);
    const set = buildSemanticDecorations(view);
    const decos: unknown[] = [];
    const cur = set.iter();
    while (cur.value) {
      decos.push(cur.value);
      cur.next();
    }
    // Both u_a and u_b classify as 'uniform' — the cache should hand back
    // the same Decoration object for both.
    expect(decos.length).toBe(2);
    expect(decos[0]).toBe(decos[1]);
    view.destroy();
  });
});

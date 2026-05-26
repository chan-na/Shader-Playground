import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { buildReferenceDecorations } from "./referenceHighlight";

function stateOf(doc: string, cursorAt: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorAt),
  });
}

const FRAG = `uniform float u_strength;
out vec4 outColor;

void main() {
  outColor = vec4(u_strength * 0.5, u_strength, 1.0, 1.0);
}
`;

function collect(set: ReturnType<typeof buildReferenceDecorations>): Array<{
  from: number;
  to: number;
  cls: string;
}> {
  const out: Array<{ from: number; to: number; cls: string }> = [];
  const cur = set.iter();
  while (cur.value) {
    const value = cur.value as unknown as { spec: { class: string } };
    out.push({ from: cur.from, to: cur.to, cls: value.spec.class });
    cur.next();
  }
  return out;
}

describe("buildReferenceDecorations", () => {
  it("returns Decoration.none when the cursor is not on an identifier", () => {
    const state = stateOf(FRAG, FRAG.indexOf("  outColor") + 1);
    const set = buildReferenceDecorations(state);
    expect(set.size).toBe(0);
  });

  it("returns Decoration.none for an identifier with no binding (builtin)", () => {
    const state = stateOf(FRAG, FRAG.indexOf("vec4(") + 1);
    const set = buildReferenceDecorations(state);
    expect(set.size).toBe(0);
  });

  it("tags the declaration with cm-glsl-ref-definition and uses with -occurrence", () => {
    // Cursor on a usage of u_strength inside main().
    const usePos = FRAG.indexOf("u_strength", FRAG.indexOf("vec4(")) + 1;
    const state = stateOf(FRAG, usePos);
    const ranges = collect(buildReferenceDecorations(state));
    expect(ranges.length).toBe(3); // decl + 2 uses
    const slice = (i: number) => FRAG.slice(ranges[i]!.from, ranges[i]!.to);
    expect(slice(0)).toBe("u_strength");
    expect(ranges[0]!.cls).toBe("cm-glsl-ref-definition");
    expect(ranges[1]!.cls).toBe("cm-glsl-ref-occurrence");
    expect(ranges[2]!.cls).toBe("cm-glsl-ref-occurrence");
  });

  it("suppresses output when the symbol only has one site (decl alone)", () => {
    const SRC = "uniform float u_unused;\n";
    const state = stateOf(SRC, SRC.indexOf("u_unused") + 1);
    const set = buildReferenceDecorations(state);
    expect(set.size).toBe(0);
  });

  it("scopes a local highlight to its function body", () => {
    const SRC = `uniform float k;
void inner() {
  float k = 2.0;
  outColor = vec4(k, k, 1.0, 1.0);
}
void main() {
  outColor = vec4(k);
}
`;
    // Cursor on the local `k` inside inner().
    const localK = SRC.indexOf("float k =") + "float ".length;
    const state = stateOf(SRC, localK + 1);
    const ranges = collect(buildReferenceDecorations(state));
    // 1 decl + 2 uses on the next line — global `k` on line 1 must not appear.
    expect(ranges.length).toBe(3);
    for (const r of ranges) {
      expect(SRC.slice(r.from, r.to)).toBe("k");
    }
  });
});

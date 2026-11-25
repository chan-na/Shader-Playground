import { describe, expect, it } from "vitest";
import { resolveSymbol, symbolsVisibleAt } from "./symbolScope";
import { buildSymbolTable } from "./symbolTable";

describe("symbolsVisibleAt", () => {
  const SRC = `uniform float u_time;
float helper(float x) {
  float y = x * 2.0;
  return y;
}

void main() {
  vec3 c = vec3(0.0);
  float a = 0.0;
}
`;
  const T = buildSymbolTable(SRC);

  it("returns globals + locals/parameters of the enclosing function", () => {
    // Inside main(), at the `float a = 0.0;` line.
    const at = symbolsVisibleAt(T, 9);
    const names = at.map((s) => s.name);
    // Locals declared up to that line are visible (`c`); `a` itself is also
    // visible at its own declaration line.
    expect(names).toContain("c");
    expect(names).toContain("a");
    // Globals are visible.
    expect(names).toContain("u_time");
    expect(names).toContain("helper");
    expect(names).toContain("main");
    // helper's params/locals are NOT visible in main.
    expect(names).not.toContain("x");
    expect(names).not.toContain("y");
  });

  it("hides locals declared on later lines", () => {
    // Inside main(), at the `vec3 c = vec3(0.0);` line.
    const at = symbolsVisibleAt(T, 8);
    expect(at.map((s) => s.name)).toContain("c");
    expect(at.map((s) => s.name)).not.toContain("a");
  });

  it("returns only globals at file scope", () => {
    // Line 1 (uniform decl) — no enclosing function.
    const at = symbolsVisibleAt(T, 1);
    expect(at.every((s) => s.scope === null)).toBe(true);
  });

  it("dedupes by name with in-scope entries taking precedence", () => {
    const src = `float v_uv = 0.0;
void main() {
  float v_uv = 1.0;
}
`;
    const t = buildSymbolTable(src);
    // Inside main: the local shadows the global; symbolsVisibleAt returns
    // the local first.
    const at = symbolsVisibleAt(t, 3);
    const first = at.find((s) => s.name === "v_uv");
    expect(first?.kind).toBe("local");
  });
});

describe("resolveSymbol", () => {
  const SRC = `uniform float u_time;
float helper(float x) {
  return x;
}

void main() {
  float a = 0.0;
}
`;
  const T = buildSymbolTable(SRC);

  it("resolves a global from anywhere", () => {
    expect(resolveSymbol(T, "u_time", 7)?.kind).toBe("uniform");
    expect(resolveSymbol(T, "helper", 7)?.kind).toBe("function");
  });

  it("resolves a local within its function only", () => {
    expect(resolveSymbol(T, "a", 7)?.kind).toBe("local");
    // `a` is not visible in helper().
    expect(resolveSymbol(T, "a", 3)).toBeNull();
  });

  it("returns null for unknown names", () => {
    expect(resolveSymbol(T, "does_not_exist", 7)).toBeNull();
  });
});

describe("symbolsVisibleAt memoization (L21)", () => {
  const SRC = `uniform float u_time;
float helper(float x) {
  float inner = x;
  return inner;
}
void main() {
  float a = 0.0;
}
`;

  it("returns identical content for repeated (table, line) queries", () => {
    const t = buildSymbolTable(SRC);
    const a = symbolsVisibleAt(t, 7);
    const b = symbolsVisibleAt(t, 7);
    expect(b).toEqual(a);
  });

  it("hands out a fresh array — mutating a result cannot poison the cache", () => {
    // `main.tsx` publishes symbolsVisibleAt on the DEV `window.__sp` bridge,
    // so E2E page code holds a reference to whatever comes back.
    const t = buildSymbolTable(SRC);
    const first = symbolsVisibleAt(t, 7);
    const second = symbolsVisibleAt(t, 7);
    expect(second).not.toBe(first);
    second.length = 0;
    second.push({
      name: "poison",
      type: "float",
      kind: "local",
      line: 1,
      column: 1,
      scope: null,
    });
    const third = symbolsVisibleAt(t, 7);
    expect(third).toEqual(first);
    expect(third.some((s) => s.name === "poison")).toBe(false);
  });

  it("keys on table identity, not on the line number alone", () => {
    // findReferencesAcrossStages builds two tables per call; a line-only key
    // would serve the vertex stage's symbols to the fragment stage.
    const other = buildSymbolTable(`uniform vec3 u_other;
void main() { float b = 0.0; }
`);
    const t = buildSymbolTable(SRC);
    expect(symbolsVisibleAt(t, 7).map((s) => s.name)).toContain("u_time");
    expect(symbolsVisibleAt(other, 7).map((s) => s.name)).toContain("u_other");
    expect(symbolsVisibleAt(other, 7).map((s) => s.name)).not.toContain(
      "u_time",
    );
  });
});

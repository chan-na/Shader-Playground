import { describe, expect, it } from "vitest";
import {
  buildSymbolTable,
  parseFunctionParameters,
  resolveSymbol,
  symbolsVisibleAt,
} from "./symbolTable";

describe("buildSymbolTable", () => {
  it("captures storage-qualified globals — uniform/in/out/const", () => {
    const src = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec2 v_uv;
uniform float u_time;
uniform sampler2D u_tex;
const float k = 1.0;
out vec4 outColor;
`;
    const t = buildSymbolTable(src);
    const byName = new Map(t.symbols.map((s) => [s.name, s]));
    expect(byName.get("v_normal")?.kind).toBe("in");
    expect(byName.get("v_normal")?.type).toBe("vec3");
    expect(byName.get("u_time")?.kind).toBe("uniform");
    expect(byName.get("u_tex")?.type).toBe("sampler2D");
    expect(byName.get("k")?.kind).toBe("const");
    expect(byName.get("outColor")?.kind).toBe("out");
    // All globals carry scope=null.
    for (const s of t.symbols) expect(s.scope).toBeNull();
  });

  it("captures function declarations with parameters in the same scope", () => {
    const src = `float hash(vec2 p) {
  return fract(p.x * p.y);
}

float noise(vec2 p, float k) {
  return p.x;
}
`;
    const t = buildSymbolTable(src);
    const fns = t.symbols.filter((s) => s.kind === "function");
    expect(fns.map((f) => f.name)).toEqual(["hash", "noise"]);
    expect(fns[0]?.type).toBe("float");
    expect(fns[0]?.parameters).toBe("vec2 p");
    expect(fns[1]?.parameters).toBe("vec2 p, float k");

    const params = t.symbols.filter((s) => s.kind === "parameter");
    expect(params.map((p) => `${p.name}@${p.scope}`)).toEqual([
      "p@hash",
      "p@noise",
      "k@noise",
    ]);
  });

  it("captures local variables in function bodies and tags them with the enclosing function", () => {
    const src = `void main() {
  vec3 n = vec3(0.0);
  float ndl = 0.5;
  vec2 uv = vec2(1.0, 0.0);
}
`;
    const t = buildSymbolTable(src);
    const locals = t.symbols.filter((s) => s.kind === "local");
    expect(locals.map((l) => l.name)).toEqual(["n", "ndl", "uv"]);
    for (const l of locals) expect(l.scope).toBe("main");
    expect(locals[0]?.type).toBe("vec3");
    expect(locals[1]?.type).toBe("float");
  });

  it("captures for-loop induction variables as locals", () => {
    const src = `void main() {
  for (int i = 0; i < 4; i++) {
    float t = float(i);
  }
}
`;
    const t = buildSymbolTable(src);
    const locals = t.symbols.filter((s) => s.kind === "local");
    expect(locals.map((l) => l.name)).toEqual(["i", "t"]);
    expect(locals[0]?.scope).toBe("main");
  });

  it("does not confuse if/for/while/return headers with function declarations", () => {
    const src = `void main() {
  if (true) {
    return;
  }
  for (int i = 0; i < 4; i++) {
  }
}
`;
    const t = buildSymbolTable(src);
    const fns = t.symbols.filter((s) => s.kind === "function");
    expect(fns.map((f) => f.name)).toEqual(["main"]);
  });

  it("handles multi-declaration shorthand (`vec3 a, b;`)", () => {
    const src = `void main() {
  vec3 a, b = vec3(1.0);
  float x = 0.0, y = 1.0;
}
`;
    const t = buildSymbolTable(src);
    const locals = t.symbols.filter((s) => s.kind === "local");
    expect(locals.map((l) => `${l.name}:${l.type}`)).toEqual([
      "a:vec3",
      "b:vec3",
      "x:float",
      "y:float",
    ]);
  });

  it("strips block comments while preserving line numbers", () => {
    const src = `/* leading
comment block
spanning lines */
uniform float u_x;
`;
    const t = buildSymbolTable(src);
    const u = t.symbols.find((s) => s.name === "u_x");
    expect(u?.line).toBe(4);
  });

  it("ignores annotations inside line comments without losing declarations", () => {
    const src = `// @range 0..1
uniform float u_y; // @label "Y"
`;
    const t = buildSymbolTable(src);
    expect(t.symbols.find((s) => s.name === "u_y")?.kind).toBe("uniform");
  });

  it("captures struct declarations as global symbols", () => {
    const src = `struct Light {
  vec3 dir;
  float intensity;
};

void main() {}
`;
    const t = buildSymbolTable(src);
    expect(t.symbols.find((s) => s.name === "Light")?.kind).toBe("struct");
    // Members are NOT indexed (intentional — not goals).
    expect(t.symbols.find((s) => s.name === "dir")).toBeUndefined();
  });

  it("re-opens global scope after a function body closes", () => {
    const src = `float k() { return 1.0; }

uniform float u_after;
`;
    const t = buildSymbolTable(src);
    expect(t.symbols.find((s) => s.name === "u_after")?.scope).toBeNull();
  });

  it("records line and column for the identifier (not the storage keyword)", () => {
    const src = `uniform float u_x;`;
    const t = buildSymbolTable(src);
    const s = t.symbols[0]!;
    expect(s.line).toBe(1);
    // `u_x` starts at column 15 (1-based): `uniform float u_x`
    //                                       123456789012345
    expect(s.column).toBe(15);
  });
});

describe("parseFunctionParameters", () => {
  it("returns an empty list for `()` and `(void)`", () => {
    expect(parseFunctionParameters("")).toEqual([]);
    expect(parseFunctionParameters("void")).toEqual([]);
    expect(parseFunctionParameters(" void ")).toEqual([]);
  });

  it("parses single and multi-parameter declarations", () => {
    expect(parseFunctionParameters("vec2 p")).toEqual([
      { type: "vec2", name: "p" },
    ]);
    expect(parseFunctionParameters("vec3 p, float k")).toEqual([
      { type: "vec3", name: "p" },
      { type: "float", name: "k" },
    ]);
  });

  it("strips qualifiers (`in`/`out`/`inout`) and precision before the type", () => {
    expect(parseFunctionParameters("in vec3 p, out float r")).toEqual([
      { type: "vec3", name: "p" },
      { type: "float", name: "r" },
    ]);
    expect(parseFunctionParameters("highp float x")).toEqual([
      { type: "float", name: "x" },
    ]);
  });
});

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

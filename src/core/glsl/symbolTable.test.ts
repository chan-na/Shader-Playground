import { describe, expect, it } from "vitest";
import {
  buildSymbolTable,
  parseFunctionParameters,
  precededByDot,
  resolveSymbol,
  structMemberNameOffsets,
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

  it("captures storage declarations prefixed with an interpolation qualifier (flat/centroid)", () => {
    const src = `flat out int v_id;
centroid in vec2 v;
`;
    const t = buildSymbolTable(src);
    const byName = new Map(t.symbols.map((s) => [s.name, s]));
    const vId = byName.get("v_id");
    expect(vId?.kind).toBe("out");
    expect(vId?.type).toBe("int");
    expect(vId?.line).toBe(1);
    // Column is 1-based and must point at "v_id", not be shifted by "flat ".
    expect(vId?.column).toBe(src.split("\n")[0]!.indexOf("v_id") + 1);

    const v = byName.get("v");
    expect(v?.kind).toBe("in");
    expect(v?.type).toBe("vec2");
    expect(v?.line).toBe(2);
    expect(v?.column).toBe(src.split("\n")[1]!.indexOf(" v;") + 2);
  });

  it("harvests every declarator of a global comma multi-declaration", () => {
    const src = `out vec2 v_uv, v_st;
uniform mat4 u_view, u_proj;
`;
    const t = buildSymbolTable(src);
    const byName = new Map(t.symbols.map((s) => [s.name, s]));
    expect(byName.get("v_uv")?.kind).toBe("out");
    expect(byName.get("v_st")?.kind).toBe("out");
    expect(byName.get("v_st")?.type).toBe("vec2");
    // Column points at the declarator itself, not the comma or the space.
    expect(byName.get("v_st")?.column).toBe(
      src.split("\n")[0]!.indexOf("v_st") + 1,
    );
    expect(byName.get("u_view")?.kind).toBe("uniform");
    expect(byName.get("u_proj")?.kind).toBe("uniform");
    expect(byName.get("u_proj")?.type).toBe("mat4");
    for (const s of t.symbols) expect(s.scope).toBeNull();
  });

  it("does not harvest call-initializer args of a global const as phantom globals", () => {
    // `[^,;]+` stops at the first comma, which for a call initializer sits
    // *inside* the parens — the bracketDepth guard must refuse the walk, so
    // `a`/`b` here are recognized as call args, not extra const declarators.
    const src = `const vec3 K = mix(vec3(0.0), vec3(1.0), 0.5);
const float x = 0.0, y = 1.0;
`;
    const t = buildSymbolTable(src);
    const consts = t.symbols.filter((s) => s.kind === "const");
    expect(consts.map((c) => `${c.name}:${c.type}`)).toEqual([
      "K:vec3",
      "x:float",
      "y:float",
    ]);
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

  it("does not register function-call args as phantom locals (M6)", () => {
    const src = `void main() {
  vec3 a = vec3(0.0);
  vec3 b = vec3(1.0);
  float t = 0.5;
  vec3 c = mix(a, b, t);
}
`;
    const table = buildSymbolTable(src);
    const locals = table.symbols.filter((s) => s.kind === "local");
    // `mix(a, b, t)` is a single declarator (c); a/b/t are call args, not extra
    // declarators — they must not be re-added as phantom vec3 locals.
    expect(locals.map((l) => l.name)).toEqual(["a", "b", "t", "c"]);
  });

  it("handles a later declarator with a call initializer (M6)", () => {
    const src = `void main() {
  vec3 a, b = mix(vec3(0.0), vec3(1.0), 0.5), c;
}
`;
    const table = buildSymbolTable(src);
    const locals = table.symbols.filter((s) => s.kind === "local");
    // Commas inside mix(...) are skipped; only a, b, c are declarators.
    expect(locals.map((l) => l.name)).toEqual(["a", "b", "c"]);
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

describe("buildSymbolTable memoization (L25)", () => {
  it("returns the same table instance for identical source (cache hit)", () => {
    const src = `// L25-memo-hit
uniform float u_time;
void main() { float x = 0.0; }
`;
    const a = buildSymbolTable(src);
    const b = buildSymbolTable(src);
    // A cache hit hands back the very same object — the parse ran only once.
    expect(b).toBe(a);
  });

  it("returns a distinct instance for a different source", () => {
    const a = buildSymbolTable(`// L25-memo-distinct-a
uniform float u_a;
`);
    const b = buildSymbolTable(`// L25-memo-distinct-b
uniform float u_b;
`);
    expect(b).not.toBe(a);
    expect(a.symbols.find((s) => s.name === "u_a")?.kind).toBe("uniform");
    expect(b.symbols.find((s) => s.name === "u_b")?.kind).toBe("uniform");
  });

  it("re-parses (new instance, equal content) after LRU eviction", () => {
    const base = `// L25-evict-base
uniform vec3 u_base;
void main() { float k = 1.0; }
`;
    const first = buildSymbolTable(base);
    // Fill the cache past its cap (SYMBOL_TABLE_CACHE_MAX = 8) with distinct
    // sources so `base` is evicted as the least-recently-used entry.
    for (let i = 0; i < 10; i++) {
      buildSymbolTable(`// L25-evict-filler-${i}
uniform float u_f${i};
`);
    }
    const reparsed = buildSymbolTable(base);
    // Evicted → parsed fresh → a new object, but structurally identical.
    expect(reparsed).not.toBe(first);
    expect(reparsed.symbols).toEqual(first.symbols);
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

describe("parameter columns (L32)", () => {
  it("anchors a parameter past its own type token", () => {
    // `indexOf("m", afterParen)` lands on the `m` of `mat3` — the parameter
    // column would point at the type, so F12 on `m` jumped one token left.
    const src = `void apply(mat3 m) {
  float x = 0.0;
}
`;
    const p = buildSymbolTable(src).symbols.find((s) => s.kind === "parameter");
    expect(p?.name).toBe("m");
    expect(src.split("\n")[0]?.[p!.column - 1]).toBe("m");
    // `mat3 ` starts at column 12, so `m` is at column 17.
    expect(p?.column).toBe(17);
  });

  it("advances a running cursor across parameters", () => {
    // The second parameter is named `f`, which also occurs inside `float` —
    // and inside the first parameter's type. Both anchors are needed.
    const src = `void go(vec3 v, float f) {
  float x = 0.0;
}
`;
    const params = buildSymbolTable(src).symbols.filter(
      (s) => s.kind === "parameter",
    );
    expect(params.map((p) => p.name)).toEqual(["v", "f"]);
    const line = src.split("\n")[0] ?? "";
    for (const p of params) {
      expect(line[p.column - 1]).toBe(p.name);
    }
    // `f` is the parameter, not the `f` of `float`.
    expect(params[1]?.column).toBe(23);
  });

  it("keeps repeated type/name spellings on distinct columns", () => {
    const src = `vec3 blend(vec3 base, vec3 baseColor) {
  return base;
}
`;
    const params = buildSymbolTable(src).symbols.filter(
      (s) => s.kind === "parameter",
    );
    const line = src.split("\n")[0] ?? "";
    expect(params).toHaveLength(2);
    expect(line.slice(params[0]!.column - 1, params[0]!.column + 3)).toBe(
      "base",
    );
    expect(line.slice(params[1]!.column - 1, params[1]!.column + 8)).toBe(
      "baseColor",
    );
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

describe("precededByDot (L5)", () => {
  it("detects member and swizzle access", () => {
    const line = "  outColor = vec4(light.color, v.x);";
    expect(precededByDot(line, line.indexOf("color,"))).toBe(true);
    expect(precededByDot(line, line.indexOf("x)"))).toBe(true);
  });

  it("skips intervening spaces and tabs only", () => {
    expect(precededByDot("a .\tb", 4)).toBe(true);
    expect(precededByDot("a b", 2)).toBe(false);
    expect(precededByDot("color", 0)).toBe(false);
  });
});

describe("structMemberNameOffsets (L5)", () => {
  /** Render the collected offsets as `name@offset` for readable assertions. */
  function named(src: string): string[] {
    return [...structMemberNameOffsets(src)]
      .sort((a, b) => a - b)
      .map((off) => {
        const m = /^[A-Za-z_][\w]*/.exec(src.slice(off));
        return `${m?.[0] ?? "?"}@${off}`;
      });
  }

  it("collects member names from a multi-line struct", () => {
    const src = `struct Light {
  vec3 color;
  float intensity;
};
uniform vec3 color;
`;
    expect(named(src)).toEqual([
      `color@${src.indexOf("color")}`,
      `intensity@${src.indexOf("intensity")}`,
    ]);
    // The uniform outside the struct is untouched.
    expect(structMemberNameOffsets(src).has(src.lastIndexOf("color"))).toBe(
      false,
    );
  });

  it("handles a single-line struct", () => {
    const src = `struct P { float a; };\n`;
    expect(named(src)).toEqual([`a@${src.indexOf("a;")}`]);
  });

  it("collects an unbalanced struct body to end of source", () => {
    const src = `struct Broken {\n  float a;\n  float b;\n`;
    expect(named(src)).toEqual([
      `a@${src.indexOf("a;")}`,
      `b@${src.indexOf("b;")}`,
    ]);
  });

  it("collects every declarator of a comma-chained member", () => {
    const src = `struct V { float a, b, c; };\n`;
    expect(named(src)).toEqual([
      `a@${src.indexOf("a,")}`,
      `b@${src.indexOf("b,")}`,
      `c@${src.indexOf("c;")}`,
    ]);
  });

  it("skips a precision qualifier before the member type", () => {
    const src = `struct P { highp float a; };\n`;
    expect(named(src)).toEqual([`a@${src.indexOf("a;")}`]);
  });

  it("does NOT collect a member's struct type name", () => {
    // Renaming `Inner` must still rewrite the `Inner i;` use — otherwise the
    // declaration moves and the use is stranded, which is the exact
    // broken-shader failure the member guard exists to prevent.
    const src = `struct Inner { float a; };
struct Outer {
  Inner i;
};
`;
    expect(named(src)).toEqual([
      `a@${src.indexOf("a;")}`,
      `i@${src.indexOf("i;")}`,
    ]);
  });

  it("does NOT collect an array-size const inside a member", () => {
    const src = `const int MAX = 4;
struct Buf {
  float v[MAX];
};
`;
    expect(named(src)).toEqual([`v@${src.indexOf("v[")}`]);
  });
});

describe("comment masking in the symbol walk (L20)", () => {
  it("ignores declarations that live inside a block comment", () => {
    const src = `/*
uniform float u_commented;
*/
uniform float u_real;
`;
    const names = buildSymbolTable(src).symbols.map((s) => s.name);
    expect(names).toContain("u_real");
    expect(names).not.toContain("u_commented");
  });

  it("does not let a `/*` inside a line comment swallow real code", () => {
    // The old two-pass stripper matched this `/*` against the `*/` two lines
    // down and blanked the declaration between them.
    const src = `// /* opens?
uniform float u_kept;
// */ closes?
uniform float u_after;
`;
    const names = buildSymbolTable(src).symbols.map((s) => s.name);
    expect(names).toContain("u_kept");
    expect(names).toContain("u_after");
  });
});

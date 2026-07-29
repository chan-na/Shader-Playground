import { describe, expect, it } from "vitest";
import {
  findReferences,
  findReferencesAcrossStages,
  findReferencesOf,
} from "./references";
import { buildSymbolTable, resolveSymbol } from "./symbolTable";

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform float u_strength;
out vec4 outColor;

float hash(vec2 p) {
  return fract(p.x * p.y * 1234.5);
}

void main() {
  float n = hash(v_uv * 10.0);
  vec3 col = vec3(n) * u_strength * sin(u_time);
  outColor = vec4(col, 1.0);
}
`;

describe("findReferences — globals", () => {
  it("returns the declaration and every use site for a uniform", () => {
    // u_strength: declared line 5, used inside main() at line 14.
    const sites = findReferences(FRAG, "u_strength", 5);
    expect(sites).toHaveLength(2);
    expect(sites[0]?.isDefinition).toBe(true);
    expect(sites[0]?.line).toBe(5);
    expect(sites[1]?.isDefinition).toBe(false);
    expect(sites[1]?.line).toBe(14);
    // Token spans match the identifier exactly.
    for (const s of sites) {
      expect(FRAG.slice(s.from, s.to)).toBe("u_strength");
    }
  });

  it("returns references for a system uniform when declared", () => {
    const sites = findReferences(FRAG, "u_time", 4);
    expect(sites.length).toBe(2);
    expect(sites.some((s) => s.isDefinition)).toBe(true);
  });

  it("returns the function declaration plus every call site", () => {
    // `hash` declared at line 8, called at line 13.
    const sites = findReferences(FRAG, "hash", 8);
    expect(sites).toHaveLength(2);
    const def = sites.find((s) => s.isDefinition);
    expect(def?.line).toBe(8);
    const call = sites.find((s) => !s.isDefinition);
    expect(call?.line).toBe(13);
  });

  it("returns the `in` global declaration plus its uses", () => {
    const sites = findReferences(FRAG, "v_uv", 3);
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites[0]?.isDefinition).toBe(true);
    expect(sites[0]?.line).toBe(3);
  });
});

describe("findReferences — parameters and locals", () => {
  it("returns the parameter declaration plus uses inside its function body", () => {
    // `p` is hash()'s parameter, declared on the function-header line 8.
    const sites = findReferences(FRAG, "p", 8);
    // Two occurrences inside the body — `p.x` and `p.y` on line 9 — plus the
    // declaration site itself, for 3 total.
    expect(sites).toHaveLength(3);
    for (const s of sites) expect(FRAG.slice(s.from, s.to)).toBe("p");
  });

  it("returns local-variable references only inside the same function", () => {
    // `n` is a local in main() declared on line 13.
    const sites = findReferences(FRAG, "n", 13);
    // Declared on line 13, used in vec3(n) on line 14.
    expect(sites).toHaveLength(2);
    expect(sites[0]?.line).toBe(13);
    expect(sites[1]?.line).toBe(14);
  });
});

describe("findReferences — shadowing", () => {
  const SHADOW = `#version 300 es
precision highp float;
uniform float k;
out vec4 outColor;

void inner() {
  float k = 2.0;
  outColor = vec4(k, k, k, 1.0);
}

void main() {
  outColor = vec4(k);
}
`;

  it("global references skip occurrences inside shadowed scopes", () => {
    // `k` global declared on line 3. Used at line 12 (main), but shadowed
    // inside inner() (lines 7-8).
    const sites = findReferences(SHADOW, "k", 3);
    const lines = sites.map((s) => s.line).sort((a, b) => a - b);
    expect(lines).toEqual([3, 12]);
  });

  it("local references stay inside the function that declares them", () => {
    // `k` local in inner(), declared line 7. Three usages on line 8 inside
    // `vec4(k, k, k, 1.0)` plus the declaration site = 4 occurrences total.
    const sites = findReferences(SHADOW, "k", 7);
    const lines = sites.map((s) => s.line).sort((a, b) => a - b);
    expect(lines).toEqual([7, 8, 8, 8]);
    expect(sites.filter((s) => s.line === 8)).toHaveLength(3);
  });
});

describe("findReferences — edge cases", () => {
  it("returns [] when no declaration is in scope", () => {
    // `gone` is not declared anywhere.
    expect(findReferences(FRAG, "gone", 12)).toEqual([]);
  });

  it("returns [] when asked about a builtin (no source-level decl)", () => {
    // `sin` is a builtin function — not in the symbol table.
    expect(findReferences(FRAG, "sin", 16)).toEqual([]);
  });

  it("ignores identifier text inside comments", () => {
    const SRC = `uniform float u_x;
// u_x mentioned in a line comment
/* u_x mentioned in a block comment
   and continues here */
void main() { gl_FragColor = vec4(u_x); }
`;
    const sites = findReferences(SRC, "u_x", 1);
    expect(sites).toHaveLength(2);
    // Lines 1 (decl) and 5 (use) — the comments on lines 2-4 are skipped.
    expect(sites.map((s) => s.line).sort((a, b) => a - b)).toEqual([1, 5]);
  });

  it("emits results in document order", () => {
    const sites = findReferences(FRAG, "u_strength", 5);
    for (let i = 1; i < sites.length; i++) {
      expect(sites[i]?.from).toBeGreaterThan(sites[i - 1]?.from ?? -1);
    }
  });
});

describe("findReferencesOf", () => {
  it("accepts a precomputed table + target to skip the resolve step", () => {
    const table = buildSymbolTable(FRAG);
    const target = resolveSymbol(table, "u_strength", 5);
    expect(target).not.toBeNull();
    const sites = findReferencesOf(FRAG, table, target!);
    expect(sites).toHaveLength(2);
  });
});

describe("findReferencesAcrossStages — Phase 28", () => {
  // Vertex declares a varying `out v_uv` and a uniform `u_time`; the fragment
  // shader receives the varying as `in v_uv` and reads the same uniform. A
  // GLSL linker treats the pairs as one binding each — renaming any of them
  // in isolation breaks the program, so cross-stage rename must hit both.
  const VERT = `#version 300 es
in vec3 a_position;
uniform float u_time;
out vec2 v_uv;

void main() {
  v_uv = a_position.xy;
  gl_Position = vec4(a_position, u_time);
}
`;
  const FRAG_X = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
out vec4 outColor;

void main() {
  outColor = vec4(v_uv, sin(u_time), 1.0);
}
`;

  it("renames a uniform across both stages when both declare it", () => {
    // Cursor on the vertex declaration of u_time (line 3 of VERT).
    const sites = findReferencesAcrossStages(
      { vertex: VERT, fragment: FRAG_X },
      "u_time",
      "vertex",
      3,
    );
    const vertex = sites.filter((s) => s.stage === "vertex");
    const fragment = sites.filter((s) => s.stage === "fragment");
    // Vertex: decl + 1 use inside main().
    expect(vertex).toHaveLength(2);
    expect(vertex.some((s) => s.isDefinition)).toBe(true);
    // Fragment: decl + 1 use inside main().
    expect(fragment).toHaveLength(2);
    expect(fragment.some((s) => s.isDefinition)).toBe(true);
    // Spans pull the exact text from each stage's source.
    for (const s of vertex) expect(VERT.slice(s.from, s.to)).toBe("u_time");
    for (const s of fragment) expect(FRAG_X.slice(s.from, s.to)).toBe("u_time");
  });

  it("renames a varying across the vertex `out` and the fragment `in`", () => {
    // Cursor on the fragment declaration of v_uv (line 3 of FRAG_X).
    const sites = findReferencesAcrossStages(
      { vertex: VERT, fragment: FRAG_X },
      "v_uv",
      "fragment",
      3,
    );
    const vertex = sites.filter((s) => s.stage === "vertex");
    const fragment = sites.filter((s) => s.stage === "fragment");
    expect(vertex.length).toBeGreaterThan(0);
    expect(fragment.length).toBeGreaterThan(0);
    expect(vertex.some((s) => s.isDefinition)).toBe(true);
    expect(fragment.some((s) => s.isDefinition)).toBe(true);
  });

  it("partial rename — other stage doesn't declare the name → origin only", () => {
    // a_position is only in vertex (it's an attribute / `in`). The fragment
    // has no such symbol. Sites should be vertex-only.
    const sites = findReferencesAcrossStages(
      { vertex: VERT, fragment: FRAG_X },
      "a_position",
      "vertex",
      2,
    );
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.every((s) => s.stage === "vertex")).toBe(true);
  });

  it("locals stay inside their stage even when the other stage uses the same name", () => {
    // Both stages reference `n` but as separate locals.
    const V = `#version 300 es
out float v_amt;
void main() {
  float n = 1.0;
  v_amt = n;
}
`;
    const F = `#version 300 es
precision highp float;
in float v_amt;
out vec4 outColor;
void main() {
  float n = v_amt * 2.0;
  outColor = vec4(n);
}
`;
    // Cursor on vertex local n (line 4 of V).
    const sites = findReferencesAcrossStages(
      { vertex: V, fragment: F },
      "n",
      "vertex",
      4,
    );
    expect(sites.every((s) => s.stage === "vertex")).toBe(true);
    expect(sites).toHaveLength(2); // decl + 1 use, both in vertex.
  });

  it("parameters stay inside their stage", () => {
    const V = `#version 300 es
out vec2 v_uv;
vec2 squeeze(vec2 p) { return p * 0.5; }
void main() { v_uv = squeeze(vec2(1.0)); }
`;
    const F = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
vec3 squeeze(vec3 p) { return p * 0.25; }
void main() { outColor = vec4(squeeze(vec3(v_uv, 1.0)), 1.0); }
`;
    // Cursor on the vertex parameter `p` (line 3 of V).
    const sites = findReferencesAcrossStages(
      { vertex: V, fragment: F },
      "p",
      "vertex",
      3,
    );
    expect(sites.every((s) => s.stage === "vertex")).toBe(true);
  });

  it("cross-stage rename for a function name reaches both stages", () => {
    const V = `#version 300 es
out vec2 v_uv;
vec2 squeeze(vec2 p) { return p * 0.5; }
void main() { v_uv = squeeze(vec2(1.0)); }
`;
    const F = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
vec2 squeeze(vec2 p) { return p * 2.0; }
void main() { outColor = vec4(squeeze(v_uv), 0.0, 1.0); }
`;
    const sites = findReferencesAcrossStages(
      { vertex: V, fragment: F },
      "squeeze",
      "vertex",
      3,
    );
    expect(sites.some((s) => s.stage === "vertex")).toBe(true);
    expect(sites.some((s) => s.stage === "fragment")).toBe(true);
  });

  it("returns [] when the identifier has no binding in the origin stage", () => {
    // `gone` is not declared anywhere.
    const sites = findReferencesAcrossStages(
      { vertex: VERT, fragment: FRAG_X },
      "gone",
      "vertex",
      2,
    );
    expect(sites).toEqual([]);
  });

  it("emits vertex sites before fragment sites in stage groups", () => {
    const sites = findReferencesAcrossStages(
      { vertex: VERT, fragment: FRAG_X },
      "u_time",
      "fragment",
      4,
    );
    // The two vertex sites should come first as a contiguous run.
    const stageSeq = sites.map((s) => s.stage);
    const firstFragment = stageSeq.indexOf("fragment");
    expect(stageSeq.slice(0, firstFragment).every((x) => x === "vertex")).toBe(
      true,
    );
    expect(stageSeq.slice(firstFragment).every((x) => x === "fragment")).toBe(
      true,
    );
  });

  it("global rename is blocked by a same-named local in the other stage", () => {
    // Fragment has a local `u_time` shadowing the global of the same name.
    // The cross-stage rename starts from the vertex global → in fragment we
    // still find the global decl, but local uses inside the shadowing
    // function must be excluded because they resolve to the local.
    const V = `#version 300 es
uniform float u_time;
void main() { gl_Position = vec4(u_time); }
`;
    const F = `#version 300 es
precision highp float;
uniform float u_time;
out vec4 outColor;
void shadow() {
  float u_time = 9.0;
  outColor = vec4(u_time);
}
void main() { outColor = vec4(u_time); }
`;
    const sites = findReferencesAcrossStages(
      { vertex: V, fragment: F },
      "u_time",
      "vertex",
      2,
    );
    const fragment = sites.filter((s) => s.stage === "fragment");
    // Fragment should pick up the global decl (line 3) and the use in main()
    // (line 9), but NOT the local decl on line 6 or its use on line 7.
    const fragLines = fragment.map((s) => s.line).sort((a, b) => a - b);
    expect(fragLines).toEqual([3, 9]);
  });
});

describe("member access and struct bodies are not references (L5)", () => {
  const SRC = `#version 300 es
precision highp float;

struct Light {
  vec3 color;
  float intensity;
};

uniform vec3 color;
uniform Light u_light;
out vec4 outColor;

void main() {
  vec3 c = color * u_light.color;
  outColor = vec4(c.xyz, 1.0);
}
`;

  it("excludes `light.color` — it binds to the member, not the uniform", () => {
    const sites = findReferences(SRC, "color", 9);
    // Declaration (line 9) + the bare use on line 14. NOT `u_light.color`
    // on the same line, and NOT the struct member declaration on line 5.
    expect(sites.map((s) => s.line)).toEqual([9, 14]);
    expect(sites.filter((s) => s.isDefinition)).toHaveLength(1);
    const bare = sites.find((s) => !s.isDefinition);
    // The accepted line-14 site is the one *before* the dot access.
    expect(bare!.from).toBeLessThan(SRC.indexOf("u_light.color"));
  });

  it("excludes the struct member declaration — renaming it breaks the shader", () => {
    // With only the member-access guard, the member declaration would be
    // rewritten while every `u_light.color` access stayed put.
    const sites = findReferences(SRC, "color", 9);
    const memberDeclOffset = SRC.indexOf("vec3 color;");
    expect(
      sites.some(
        (s) => s.from >= memberDeclOffset && s.from < memberDeclOffset + 11,
      ),
    ).toBe(false);
  });

  it("keeps swizzle letters out of the result", () => {
    const src = `uniform float x;
out vec4 outColor;
void main() {
  vec3 v = vec3(x);
  outColor = vec4(v.x, v.x, x, 1.0);
}
`;
    const sites = findReferences(src, "x", 1);
    // Declaration on line 1, the `vec3(x)` use on line 4, and the bare `x`
    // argument on line 5 — but neither `v.x`.
    expect(sites).toHaveLength(3);
    expect(sites.map((s) => s.line)).toEqual([1, 4, 5]);
  });

  // The struct guard excludes member *names* only. Excluding the whole body
  // would strand the uses below when their declaration is renamed — the same
  // broken-shader failure, entered from the other side.
  it("keeps a struct type used as another struct's member type", () => {
    const src = `struct Inner { float a; };
struct Outer {
  Inner i;
};
uniform Outer o;
void main() {}
`;
    const sites = findReferences(src, "Inner", 1);
    expect(sites.map((s) => s.line)).toEqual([1, 3]);
    expect(src.slice(sites[1]!.from, sites[1]!.to)).toBe("Inner");
  });

  it("keeps a const used as an array size inside a struct body", () => {
    const src = `const int MAX = 4;
struct Buf {
  float v[MAX];
};
uniform Buf b;
void main() {}
`;
    const sites = findReferences(src, "MAX", 1);
    expect(sites.map((s) => s.line)).toEqual([1, 3]);
    expect(src.slice(sites[1]!.from, sites[1]!.to)).toBe("MAX");
  });
});

describe("comment masking (L20)", () => {
  it("does not report occurrences inside block or line comments", () => {
    const src = `uniform float u_amp;
/* u_amp mentioned in a block comment */
void main() {
  float a = u_amp; // u_amp again
}
`;
    const sites = findReferences(src, "u_amp", 1);
    expect(sites.map((s) => s.line)).toEqual([1, 4]);
    for (const s of sites) expect(src.slice(s.from, s.to)).toBe("u_amp");
  });

  it("keeps offsets aligned when a line comment precedes the match", () => {
    const src = `uniform float u_amp;
void main() {
  // set below
  float a = u_amp;
}
`;
    const sites = findReferences(src, "u_amp", 1);
    for (const s of sites) expect(src.slice(s.from, s.to)).toBe("u_amp");
  });
});

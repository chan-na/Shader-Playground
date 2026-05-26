import { describe, expect, it } from "vitest";
import { findReferences, findReferencesOf } from "./references";
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

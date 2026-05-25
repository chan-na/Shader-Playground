import { describe, expect, it } from "vitest";
import { formatSymbolHover, identifierAt, lookupHover } from "./hover";

describe("identifierAt", () => {
  it("returns the word the cursor sits inside", () => {
    const line = "  float ndl = max(dot(n, n2), 0.0);";
    //            012345678901234567890123456789
    // The `dot` token starts at column 18 in 1-based reading; in 0-based it's 18.
    const start = line.indexOf("dot");
    // Place pos in the middle of `dot`.
    const hit = identifierAt(line, 100, 100 + start + 1);
    expect(hit?.word).toBe("dot");
    expect(hit?.from).toBe(100 + start);
    expect(hit?.to).toBe(100 + start + 3);
  });

  it("returns null between identifiers", () => {
    const line = "a + b";
    expect(identifierAt(line, 0, 1)).toEqual(
      // `+` at col 2 — pos=1 is end of `a`, still on `a`.
      { from: 0, to: 1, word: "a" },
    );
    // pos=2 sits on the `+`.
    expect(identifierAt(line, 0, 2)).toBeNull();
  });

  it("treats pos at the end of a word as still on the word", () => {
    const line = "vec3";
    const hit = identifierAt(line, 0, 4);
    expect(hit?.word).toBe("vec3");
  });

  it("does not match digit-leading tokens", () => {
    const line = "1.0";
    expect(identifierAt(line, 0, 1)).toBeNull();
  });
});

describe("formatSymbolHover", () => {
  it("renders a function with its parameters and return type", () => {
    const f = formatSymbolHover({
      name: "mix3",
      type: "vec3",
      kind: "function",
      line: 1,
      column: 1,
      scope: null,
      parameters: "vec3 a, vec3 b, float t",
    });
    expect(f.signature).toBe("vec3 mix3(vec3 a, vec3 b, float t)");
    expect(f.description).toContain("User-defined");
  });

  it("renders a parameter with its enclosing function", () => {
    const f = formatSymbolHover({
      name: "x",
      type: "float",
      kind: "parameter",
      line: 2,
      column: 1,
      scope: "helper",
    });
    expect(f.signature).toBe("float x");
    expect(f.description).toContain("helper");
  });

  it("renders a uniform with the storage qualifier prefix and surfaces system descriptions", () => {
    const sysHit = formatSymbolHover({
      name: "u_time",
      type: "float",
      kind: "uniform",
      line: 1,
      column: 1,
      scope: null,
    });
    expect(sysHit.signature).toBe("uniform float u_time");
    expect(sysHit.description).toBeTruthy();

    const userHit = formatSymbolHover({
      name: "u_userParam",
      type: "float",
      kind: "uniform",
      line: 1,
      column: 1,
      scope: null,
    });
    expect(userHit.signature).toBe("uniform float u_userParam");
    expect(userHit.description).toBeUndefined();
  });

  it("renders a local with its scope", () => {
    const f = formatSymbolHover({
      name: "ndl",
      type: "float",
      kind: "local",
      line: 5,
      column: 9,
      scope: "main",
    });
    expect(f.signature).toBe("float ndl");
    expect(f.description).toContain("main");
  });
});

describe("lookupHover", () => {
  const SRC = `#version 300 es
uniform float u_time;
uniform float u_strength;
float helper(float x) {
  return x * 2.0;
}
void main() {
  float ndl = helper(u_time);
}
`;

  it("hits user-declared uniforms via the symbol table", () => {
    const h = lookupHover(SRC, "u_strength", 3);
    expect(h?.source).toBe("symbol");
    expect(h?.signature).toBe("uniform float u_strength");
  });

  it("attaches the system description when hovering u_time", () => {
    const h = lookupHover(SRC, "u_time", 8);
    expect(h?.source).toBe("symbol");
    expect(h?.description).toMatch(/시간|time/i);
  });

  it("hits in-scope locals over globals with the same name", () => {
    const src = `float ndl = 1.0;
void main() {
  float ndl = 0.5;
}
`;
    // Inside main()'s body — line 3.
    const h = lookupHover(src, "ndl", 3);
    expect(h?.source).toBe("symbol");
    expect(h?.signature).toContain("float ndl");
    expect(h?.description).toContain("main");
  });

  it("falls back to builtin function signatures + descriptions", () => {
    const h = lookupHover(SRC, "mix", 8);
    expect(h?.source).toBe("builtin");
    expect(h?.signature).toContain("mix(");
    expect(h?.description).toContain("interpolation");
  });

  it("falls back to system-uniform description when the source doesn't declare it", () => {
    const h = lookupHover("void main(){}", "u_resolution", 1);
    expect(h?.source).toBe("system-uniform");
    expect(h?.signature).toBe("uniform u_resolution");
    expect(h?.description).toBeTruthy();
  });

  it("falls back to keyword descriptions for storage keywords", () => {
    const h = lookupHover("void main(){}", "uniform", 1);
    expect(h?.source).toBe("keyword");
    expect(h?.description).toContain("Storage qualifier");
  });

  it("returns null for unknown identifiers", () => {
    expect(lookupHover(SRC, "complete_nonsense", 1)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyIdentifier,
  classifySemanticTokens,
  type SemanticTokenKind,
} from "./semanticTokens";
import { buildSymbolTable } from "./symbolTable";

/**
 * Slice the original source at the token range and return the identifier
 * text — handy for asserting that `from/to` are pointing at the right word.
 */
function readToken(
  source: string,
  token: { from: number; to: number },
): string {
  return source.slice(token.from, token.to);
}

/** First token kind matching `name` in the source. Throws if absent. */
function firstKindOf(
  source: string,
  name: string,
): SemanticTokenKind | undefined {
  const tokens = classifySemanticTokens(source);
  for (const t of tokens) {
    if (readToken(source, t) === name) return t.kind;
  }
  return undefined;
}

describe("classifyIdentifier", () => {
  it("returns 'uniform' for a user-declared non-system uniform", () => {
    const table = buildSymbolTable(`uniform float u_strength;`);
    expect(classifyIdentifier(table, "u_strength", 1)).toBe("uniform");
  });

  it("returns 'system-uniform' for known system names (u_time, u_resolution, ...)", () => {
    const table = buildSymbolTable(`uniform float u_time;`);
    expect(classifyIdentifier(table, "u_time", 1)).toBe("system-uniform");
    // Even when the source never declares u_resolution, the runtime auto-
    // binds it — the highlighter should still tag it.
    const emptyTable = buildSymbolTable("");
    expect(classifyIdentifier(emptyTable, "u_resolution", 1)).toBe(
      "system-uniform",
    );
  });

  it("returns 'function-builtin' for catalogue names like sin/mix/texture", () => {
    const table = buildSymbolTable("");
    expect(classifyIdentifier(table, "sin", 1)).toBe("function-builtin");
    expect(classifyIdentifier(table, "mix", 1)).toBe("function-builtin");
    expect(classifyIdentifier(table, "texture", 1)).toBe("function-builtin");
  });

  it("returns null for unknown identifiers (keywords, types, random words)", () => {
    const table = buildSymbolTable("");
    expect(classifyIdentifier(table, "if", 1)).toBeNull();
    expect(classifyIdentifier(table, "vec3", 1)).toBeNull();
    expect(classifyIdentifier(table, "Something", 1)).toBeNull();
  });

  it("does not classify local variables — keeps them at the editor default color", () => {
    const src = `void main() {
  float n = 1.0;
}`;
    const table = buildSymbolTable(src);
    // `n` resolves to a local symbol but should NOT receive a token kind.
    expect(classifyIdentifier(table, "n", 2)).toBeNull();
  });

  it("user function symbol wins over a same-name builtin (precedence rule)", () => {
    // Improbable but well-defined: if the user declares `float sin() { ... }`,
    // they've redefined the name. We currently route through resolveSymbol
    // first which finds the user function symbol.
    const src = `float sin(float x) { return x; }`;
    const table = buildSymbolTable(src);
    expect(classifyIdentifier(table, "sin", 1)).toBe("function-user");
  });
});

describe("classifySemanticTokens", () => {
  it("tags uniform declarations and their usages with the same kind", () => {
    const src = `precision highp float;
uniform float u_strength;
void main() {
  float n = u_strength * 2.0;
}
`;
    const tokens = classifySemanticTokens(src);
    const matches = tokens.filter((t) => readToken(src, t) === "u_strength");
    expect(matches).toHaveLength(2);
    for (const m of matches) expect(m.kind).toBe("uniform");
  });

  it("returns absolute document offsets pointing at the identifier text", () => {
    const src = `uniform float u_time;`;
    const tokens = classifySemanticTokens(src);
    const t = tokens.find((tt) => readToken(src, tt) === "u_time");
    expect(t).toBeDefined();
    expect(src.slice(t!.from, t!.to)).toBe("u_time");
    expect(t!.kind).toBe("system-uniform");
  });

  it("classifies a user function header AND its call site as 'function-user'", () => {
    const src = `float hash(vec2 p) {
  return fract(p.x * p.y);
}

void main() {
  float n = hash(vec2(0.0));
}
`;
    const kinds = classifySemanticTokens(src)
      .filter((t) => readToken(src, t) === "hash")
      .map((t) => t.kind);
    expect(kinds).toEqual(["function-user", "function-user"]);
  });

  it("classifies function parameters at the declaration site", () => {
    const src = `float hash(vec2 p) {
  return fract(p.x);
}
`;
    // The declaration line has `p` as a parameter. We're explicit that the
    // declaration site is classified — usages inside the body resolve to the
    // same parameter symbol via symbolsVisibleAt's scope walker.
    expect(firstKindOf(src, "p")).toBe("parameter");
  });

  it("classifies builtin calls — sin, mix, texture", () => {
    const src = `void main() {
  float a = sin(1.0);
  float b = mix(0.0, 1.0, 0.5);
  vec4 c = texture(u_tex, vec2(0.0));
}
uniform sampler2D u_tex;
`;
    const tokens = classifySemanticTokens(src);
    const byName = new Map<string, SemanticTokenKind>();
    for (const t of tokens) byName.set(readToken(src, t), t.kind);
    expect(byName.get("sin")).toBe("function-builtin");
    expect(byName.get("mix")).toBe("function-builtin");
    expect(byName.get("texture")).toBe("function-builtin");
    // The user-declared sampler — make sure we don't misclassify it as
    // system-uniform just because the name starts with `u_`.
    expect(byName.get("u_tex")).toBe("uniform");
  });

  it("tags 'in' and 'out' globals distinctly", () => {
    const src = `in vec2 v_uv;
out vec4 outColor;
`;
    expect(firstKindOf(src, "v_uv")).toBe("in");
    expect(firstKindOf(src, "outColor")).toBe("out");
  });

  it("tags struct types — declaration and usage as 'struct-type'", () => {
    const src = `struct Surface {
  vec3 albedo;
};

uniform Surface u_surf;
`;
    // Both the declaration site `Surface` and the usage in `Surface u_surf`
    // resolve to the struct symbol.
    const kinds = classifySemanticTokens(src)
      .filter((t) => readToken(src, t) === "Surface")
      .map((t) => t.kind);
    expect(kinds).toEqual(["struct-type", "struct-type"]);
  });

  it("tags const globals as 'const'", () => {
    const src = `const float PI = 3.14159;
void main() {
  float x = PI;
}
`;
    const kinds = classifySemanticTokens(src)
      .filter((t) => readToken(src, t) === "PI")
      .map((t) => t.kind);
    // Two occurrences (declaration + usage), both as 'const'.
    expect(kinds).toEqual(["const", "const"]);
  });

  it("does not classify identifiers inside line comments", () => {
    // The // strip mask replaces comment payload with spaces, so the
    // identifier scanner can't see `u_time` inside the comment.
    const src = `// u_time should not be classified here
uniform float u_strength;
`;
    const tokens = classifySemanticTokens(src);
    const hits = tokens.filter((t) => readToken(src, t) === "u_time");
    expect(hits).toHaveLength(0);
    // The real declaration still gets classified.
    expect(firstKindOf(src, "u_strength")).toBe("uniform");
  });

  it("does not classify identifiers inside block comments", () => {
    const src = `/* u_time inside block comment */
uniform float u_strength;
`;
    const tokens = classifySemanticTokens(src);
    expect(tokens.filter((t) => readToken(src, t) === "u_time")).toHaveLength(
      0,
    );
  });

  it("emits tokens in document order so a RangeSetBuilder can consume them", () => {
    const src = `uniform float u_a;
uniform float u_b;
void main() {
  float x = u_a + u_b;
}
`;
    const tokens = classifySemanticTokens(src);
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]!.from).toBeGreaterThanOrEqual(tokens[i - 1]!.from);
    }
  });

  it("does not surface locals (n stays the default color)", () => {
    const src = `void main() {
  float n = 0.5;
  float m = n * 2.0;
}
`;
    const tokens = classifySemanticTokens(src);
    expect(tokens.filter((t) => readToken(src, t) === "n")).toHaveLength(0);
    expect(tokens.filter((t) => readToken(src, t) === "m")).toHaveLength(0);
  });

  it("classifies parameters used inside the body via the symbol-table scope walker", () => {
    const src = `float scale(vec2 p, float k) {
  return p.x * k;
}
`;
    const tokens = classifySemanticTokens(src);
    const params = tokens
      .filter((t) => readToken(src, t) === "p" || readToken(src, t) === "k")
      .map((t) => ({ name: readToken(src, t), kind: t.kind }));
    // Declaration site `p` and `k`, and the body usages of both.
    expect(params.length).toBeGreaterThanOrEqual(4);
    for (const t of params) expect(t.kind).toBe("parameter");
  });
});

describe("member access is not classified as the global (L5)", () => {
  it("skips a struct-field access that shares a uniform's name", () => {
    const src = `struct Light {
  vec3 color;
};
uniform vec3 color;
uniform Light u_light;
out vec4 outColor;
void main() {
  outColor = vec4(color + u_light.color, 1.0);
}
`;
    const tokens = classifySemanticTokens(src).filter(
      (t) => src.slice(t.from, t.to) === "color",
    );
    // The `u_light.color` access names the member, so it gets no token.
    const accessOffset = src.indexOf("color", src.indexOf("u_light."));
    expect(tokens.some((t) => t.from === accessOffset)).toBe(false);
    // The uniform's own declaration and its bare use are still tagged.
    expect(
      tokens.some((t) => t.from === src.indexOf("uniform vec3 color") + 13),
    ).toBe(true);
    // Scope note: the struct *member declaration* on line 2 is still tagged
    // `uniform` (the symbol table doesn't index members, so it resolves to the
    // same-named global). That is cosmetic only — `references.ts` excludes
    // struct bodies, so rename never rewrites it.
    expect(tokens.some((t) => t.from === src.indexOf("vec3 color;") + 5)).toBe(
      true,
    );
  });

  it("skips swizzle letters that collide with a declared name", () => {
    const src = `uniform float x;
out vec4 outColor;
void main() {
  vec3 v = vec3(x);
  outColor = vec4(v.x, x, 0.0, 1.0);
}
`;
    const xTokens = classifySemanticTokens(src).filter(
      (t) => src.slice(t.from, t.to) === "x",
    );
    // Declaration + `vec3(x)` + the bare `x` argument. `v.x` is a swizzle.
    expect(xTokens).toHaveLength(3);
    expect(xTokens.every((t) => t.kind === "uniform")).toBe(true);
  });
});

describe("comment masking (L20)", () => {
  it("emits no tokens for identifiers inside comments", () => {
    const src = `uniform float u_time;
/* u_time in a block comment */
void main() {
  float t = u_time; // u_time again
}
`;
    const hits = classifySemanticTokens(src).filter(
      (t) => src.slice(t.from, t.to) === "u_time",
    );
    expect(hits).toHaveLength(2);
    for (const t of hits) expect(src.slice(t.from, t.to)).toBe("u_time");
  });
});

// CRLF sources (F3). The line walk here shares its offset arithmetic with
// `references.ts`, where a `\r` stripped by `split(/\r?\n/)` made every offset
// after line 1 drift by one character per preceding line. The only production
// caller feeds `view.state.doc.toString()`, which CodeMirror has already
// normalised to LF, so this path is not reachable with `\r` today — but the
// arithmetic is pinned anyway: the defect is identical, `main.tsx` exposes
// `classify` as a dev hook taking an arbitrary string, and a mis-offset token
// paints the wrong span of text.
describe("CRLF sources (F3)", () => {
  const LF = `uniform float u_amp;
float scale(float x) { return x * u_amp; }
void main() { gl_FragColor = vec4(u_amp); }
`;

  it("token offsets slice to the identifier under CRLF", () => {
    const src = LF.replace(/\n/g, "\r\n");
    const hits = classifySemanticTokens(src).filter(
      (t) => t.kind === "uniform",
    );
    expect(hits).toHaveLength(3);
    for (const t of hits) expect(src.slice(t.from, t.to)).toBe("u_amp");
  });

  it("emits the same token stream shape as the LF source", () => {
    const crlf = LF.replace(/\n/g, "\r\n");
    const lfKinds = classifySemanticTokens(LF).map((t) => t.kind);
    const crlfKinds = classifySemanticTokens(crlf).map((t) => t.kind);
    expect(crlfKinds).toEqual(lfKinds);
  });
});

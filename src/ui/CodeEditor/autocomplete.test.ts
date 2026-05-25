import {
  CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  GLSL_FUNCTIONS,
  GLSL_KEYWORDS,
  GLSL_TYPES,
  glslSource,
  HINT_KEYWORDS,
  hintSource,
  symbolCompletions,
  uniformCompletions,
} from "./autocomplete";

function makeContext(doc: string, pos: number, explicit = false) {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, explicit);
}

function labels(result: CompletionResult | null): string[] {
  return result?.options.map((o) => o.label) ?? [];
}

describe("uniformCompletions", () => {
  it("returns name/type pairs for each uniform in the source", () => {
    const src = `
      uniform float u_intensity;
      uniform vec3 u_baseColor;
      uniform sampler2D u_tex;
    `;
    const opts = uniformCompletions(src);
    const byName = new Map(opts.map((o) => [o.label, o]));
    expect(byName.get("u_intensity")?.detail).toBe("float");
    expect(byName.get("u_baseColor")?.detail).toBe("vec3");
    expect(byName.get("u_tex")?.detail).toBe("sampler2D");
  });

  it("attaches the @label hint as info when present", () => {
    const src = `// @label "Brightness"\nuniform float u_x;`;
    const [opt] = uniformCompletions(src);
    expect(opt?.info).toBe("Brightness");
  });

  it("returns an empty list when no uniforms are declared", () => {
    expect(uniformCompletions("void main(){}")).toEqual([]);
  });
});

describe("glslSource", () => {
  it("yields builtin functions, types, keywords, and document uniforms", () => {
    const src = `uniform float u_strength;\nvoid main(){\n  smoot`;
    const ctx = makeContext(src, src.length);
    const result = glslSource(ctx);
    const names = labels(result);
    expect(names).toContain("smoothstep");
    expect(names).toContain("vec3");
    expect(names).toContain("uniform");
    expect(names).toContain("u_strength");
  });

  it("anchors the completion at the start of the partial word", () => {
    const src = "voi";
    const ctx = makeContext(src, src.length);
    const result = glslSource(ctx);
    expect(result?.from).toBe(0);
  });

  it("returns null inside line comments so hintSource can take over", () => {
    const src = "// some note her";
    const ctx = makeContext(src, src.length);
    expect(glslSource(ctx)).toBeNull();
  });

  it("requires explicit invocation when the cursor sits at a non-word position", () => {
    const src = "void main(){ }";
    const pos = src.length;
    expect(glslSource(makeContext(src, pos, false))).toBeNull();
    const explicit = glslSource(makeContext(src, pos, true));
    expect(explicit?.options.length).toBeGreaterThan(0);
  });
});

describe("hintSource", () => {
  it("fires inside a // comment when an @-prefixed token precedes the cursor", () => {
    const src = "// @ra";
    const ctx = makeContext(src, src.length);
    const result = hintSource(ctx);
    const names = labels(result);
    expect(names).toContain("@range");
    expect(names).toContain("@label");
    expect(names).toContain("@color");
  });

  it("returns null outside of a line comment", () => {
    const src = "@ra";
    const ctx = makeContext(src, src.length);
    expect(hintSource(ctx)).toBeNull();
  });

  it("returns null when no @ token is present", () => {
    const src = "// plain comment";
    const ctx = makeContext(src, src.length);
    expect(hintSource(ctx)).toBeNull();
  });
});

describe("symbolCompletions", () => {
  it("surfaces in-scope locals/parameters above global uniforms", () => {
    const src = `uniform float u_time;
float helper(float x) {
  float y = x * 2.0;
  return y;
}

void main() {
  vec3 c = vec3(0.0);
  float a = 0.0;
}
`;
    // Inside main() at line 9 (`float a = 0.0;`).
    const opts = symbolCompletions(src, 9);
    const names = opts.map((o) => o.label);
    expect(names.indexOf("c")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("a")).toBeGreaterThanOrEqual(0);
    // Globals are present too…
    expect(names).toContain("u_time");
    expect(names).toContain("helper");
    // …but appear AFTER the locals.
    expect(names.indexOf("c")).toBeLessThan(names.indexOf("u_time"));
    // helper()'s own internals are NOT visible from main().
    expect(names).not.toContain("y");
  });

  it("renders functions with a parenthesized signature as `detail`", () => {
    const src = `float helper(float x, vec2 p) { return x; }`;
    const [helper] = symbolCompletions(src, 1).filter(
      (o) => o.label === "helper",
    );
    expect(helper?.detail).toBe("float helper(float x, vec2 p)");
  });

  it("attaches the system-uniform description to known names like u_time", () => {
    const src = `uniform float u_time;\nvoid main(){}`;
    const opts = symbolCompletions(src, 2);
    const uTime = opts.find((o) => o.label === "u_time");
    expect(uTime?.info).toBeTruthy();
  });
});

describe("vocabulary coverage", () => {
  it("includes core math, geometry, and texture builtins", () => {
    for (const fn of ["sin", "cos", "mix", "clamp", "texture", "normalize"]) {
      expect(GLSL_FUNCTIONS).toContain(fn);
    }
  });

  it("includes the GLSL types used by uniform parser", () => {
    for (const t of ["vec2", "vec3", "vec4", "mat4", "sampler2D"]) {
      expect(GLSL_TYPES).toContain(t);
    }
  });

  it("includes the storage and control-flow keywords", () => {
    for (const kw of ["uniform", "in", "out", "if", "return"]) {
      expect(GLSL_KEYWORDS).toContain(kw);
    }
  });

  it("covers every documented hint key from uniformParser", () => {
    const required = [
      "@range",
      "@min",
      "@max",
      "@step",
      "@default",
      "@label",
      "@color",
      "@slider",
      "@multi",
    ];
    const labelsSet = new Set(HINT_KEYWORDS.map((h) => h.label));
    for (const key of required) expect(labelsSet.has(key)).toBe(true);
  });
});

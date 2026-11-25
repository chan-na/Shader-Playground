import { describe, expect, it } from "vitest";
import {
  parseFunctionParameters,
  precededByDot,
  structMemberNameOffsets,
} from "./glslDecl";

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

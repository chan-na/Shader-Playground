import { describe, expect, it } from "vitest";
import {
  inspectorUniforms,
  parseHintComment,
  parseUniforms,
  SYSTEM_UNIFORM_DESCRIPTIONS,
  SYSTEM_UNIFORMS,
  samplerUniforms,
  serializeHintComment,
  writeUniformHints,
} from "./uniformParser";

describe("parseUniforms", () => {
  it("parses basic float and vec uniforms", () => {
    const src = `
      uniform float u_intensity;
      uniform vec3 u_baseColor;
      uniform vec2 u_offset;
      void main() {}
    `;
    const u = parseUniforms(src);
    expect(u.map((x) => x.name).sort()).toEqual([
      "u_baseColor",
      "u_intensity",
      "u_offset",
    ]);
    const intensity = u.find((x) => x.name === "u_intensity")!;
    expect(intensity.type).toBe("float");
    expect(intensity.control).toBe("slider");
    expect(intensity.system).toBe(false);
  });

  it("detects color names → color picker", () => {
    const src = `
      uniform vec3 u_baseColor;
      uniform vec4 u_tintColor;
      uniform vec3 u_position;
    `;
    const u = parseUniforms(src);
    expect(u.find((x) => x.name === "u_baseColor")?.control).toBe("color");
    expect(u.find((x) => x.name === "u_tintColor")?.control).toBe("color");
    expect(u.find((x) => x.name === "u_position")?.control).toBe("multi");
  });

  it("flags system uniforms", () => {
    const src = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform mat4 u_view;
      uniform float u_intensity;
    `;
    const u = parseUniforms(src);
    expect(u.find((x) => x.name === "u_time")?.system).toBe(true);
    expect(u.find((x) => x.name === "u_resolution")?.system).toBe(true);
    expect(u.find((x) => x.name === "u_view")?.system).toBe(true);
    expect(u.find((x) => x.name === "u_intensity")?.system).toBe(false);
  });

  it("flags u_mouse / u_frame as system uniforms (hidden from Inspector)", () => {
    const src = `
      uniform vec4 u_mouse;
      uniform float u_frame;
      uniform float u_intensity;
    `;
    const u = parseUniforms(src);
    expect(u.find((x) => x.name === "u_mouse")?.system).toBe(true);
    expect(u.find((x) => x.name === "u_frame")?.system).toBe(true);
    expect(inspectorUniforms(u).map((x) => x.name)).toEqual(["u_intensity"]);
  });

  it("handles precision qualifiers", () => {
    const src = `
      uniform highp float u_x;
      uniform mediump vec2 u_y;
      uniform lowp sampler2D u_tex;
    `;
    const u = parseUniforms(src);
    expect(u).toHaveLength(3);
    expect(u.find((x) => x.name === "u_tex")?.control).toBe("sampler");
  });

  it("gives ivec* an array default so the multi control never crashes (H1)", () => {
    const src = `
      uniform ivec2 u_cells;
      uniform ivec3 u_grid;
      uniform ivec4 u_box;
    `;
    const u = parseUniforms(src);
    const cells = u.find((x) => x.name === "u_cells")!;
    expect(cells.type).toBe("ivec2");
    expect(cells.control).toBe("multi");
    // Regression: ivec used to fall through to a scalar `0` default, which made
    // UniformControl's `arr.map` throw. Default must be an N-length array.
    expect(Array.isArray(cells.defaultValue)).toBe(true);
    expect(cells.defaultValue).toEqual([0, 0]);
    expect(cells.step).toBe(1); // integer-friendly step
    expect(u.find((x) => x.name === "u_grid")?.defaultValue).toEqual([0, 0, 0]);
    expect(u.find((x) => x.name === "u_box")?.defaultValue).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("skips unsupported GLSL types instead of misclassifying them (M7)", () => {
    const src = `
      uniform sampler3D u_vol;
      uniform usampler2D u_idx;
      uniform uvec3 u_counts;
      uniform uint u_seed;
      uniform float u_ok;
    `;
    const u = parseUniforms(src);
    // Only the known type survives; none of the unknowns leak in as a bogus
    // "multi"/scalar spec that would crash the Inspector.
    expect(u.map((x) => x.name)).toEqual(["u_ok"]);
  });

  it("ignores commented-out uniforms", () => {
    const src = `
      // uniform float u_dead;
      /* uniform vec3 u_alsoDead; */
      uniform float u_alive;
    `;
    const u = parseUniforms(src);
    expect(u.map((x) => x.name)).toEqual(["u_alive"]);
  });

  it("does not duplicate uniforms", () => {
    const src = `
      uniform float u_x;
      uniform float u_x;
    `;
    const u = parseUniforms(src);
    expect(u).toHaveLength(1);
  });

  it("inspectorUniforms hides system + samplers + matrices", () => {
    const src = `
      uniform float u_time;
      uniform mat4 u_view;
      uniform sampler2D u_tex;
      uniform float u_intensity;
    `;
    const u = parseUniforms(src);
    const visible = inspectorUniforms(u).map((x) => x.name);
    expect(visible).toEqual(["u_intensity"]);
  });

  it("samplerUniforms returns only sampler types", () => {
    const src = `
      uniform sampler2D u_tex;
      uniform sampler2D u_normal;
      uniform float u_x;
    `;
    expect(samplerUniforms(parseUniforms(src)).map((x) => x.name)).toEqual([
      "u_tex",
      "u_normal",
    ]);
  });

  it("SYSTEM_UNIFORMS includes the canonical names", () => {
    expect(SYSTEM_UNIFORMS.has("u_time")).toBe(true);
    expect(SYSTEM_UNIFORMS.has("u_resolution")).toBe(true);
    expect(SYSTEM_UNIFORMS.has("u_model")).toBe(true);
    expect(SYSTEM_UNIFORMS.has("u_camera")).toBe(true);
    expect(SYSTEM_UNIFORMS.has("u_mouse")).toBe(true);
    expect(SYSTEM_UNIFORMS.has("u_frame")).toBe(true);
  });

  it("SYSTEM_UNIFORM_DESCRIPTIONS covers every SYSTEM_UNIFORMS entry", () => {
    for (const name of SYSTEM_UNIFORMS) {
      const desc = SYSTEM_UNIFORM_DESCRIPTIONS[name];
      expect(desc, `missing description for ${name}`).toBeTruthy();
    }
  });
});

describe("parseHintComment", () => {
  it("parses @range", () => {
    const h = parseHintComment("// @range 0..10");
    expect(h.min).toBe(0);
    expect(h.max).toBe(10);
  });

  it("parses @min and @max independently", () => {
    const h = parseHintComment("// @min -5 @max 5");
    expect(h.min).toBe(-5);
    expect(h.max).toBe(5);
  });

  it("parses @step", () => {
    const h = parseHintComment("// @step 0.05");
    expect(h.step).toBe(0.05);
  });

  it("parses scalar @default", () => {
    const h = parseHintComment("// @default 0.42");
    expect(h.defaultValue).toBe(0.42);
  });

  it("parses vector @default", () => {
    const h = parseHintComment("// @default 1, 0.5, 0.2");
    expect(h.defaultValue).toEqual([1, 0.5, 0.2]);
  });

  it("parses @label with quotes", () => {
    const h = parseHintComment('// @label "Tint Color"');
    expect(h.label).toBe("Tint Color");
  });

  it("parses bare @label", () => {
    const h = parseHintComment("// @label Brightness");
    expect(h.label).toBe("Brightness");
  });

  it("returns an empty object for non-hint text", () => {
    expect(parseHintComment("// just a normal comment")).toEqual({});
    expect(parseHintComment("")).toEqual({});
  });
});

describe("parseUniforms with hints", () => {
  it("applies trailing @range hint", () => {
    const src = `uniform float u_intensity; // @range 0..5 @default 2`;
    const u = parseUniforms(src);
    const x = u.find((u) => u.name === "u_intensity")!;
    expect(x.min).toBe(0);
    expect(x.max).toBe(5);
    expect(x.defaultValue).toBe(2);
  });

  it("applies hint from preceding comment line", () => {
    const src = `
      // @range -3..3 @step 0.1 @label "Frequency"
      uniform float u_freq;
    `;
    const u = parseUniforms(src);
    const x = u.find((u) => u.name === "u_freq")!;
    expect(x.min).toBe(-3);
    expect(x.max).toBe(3);
    expect(x.step).toBe(0.1);
    expect(x.label).toBe("Frequency");
  });

  it("applies vector default", () => {
    const src = `
      // @default 0.2, 0.4, 0.8
      uniform vec3 u_tint;
    `;
    const u = parseUniforms(src);
    const x = u.find((u) => u.name === "u_tint")!;
    expect(x.defaultValue).toEqual([0.2, 0.4, 0.8]);
  });

  it("combines hints across multiple preceding lines", () => {
    const src = `
      // @range 0..1
      // @default 0.7
      uniform float u_amount;
    `;
    const u = parseUniforms(src);
    const x = u.find((u) => u.name === "u_amount")!;
    expect(x.min).toBe(0);
    expect(x.max).toBe(1);
    expect(x.defaultValue).toBe(0.7);
  });

  it("@color forces color control on a non-color-named vec3", () => {
    const src = `uniform vec3 u_tint; // @color`;
    const u = parseUniforms(src);
    const x = u.find((u) => u.name === "u_tint")!;
    expect(x.control).toBe("color");
    expect(x.min).toBe(0);
    expect(x.max).toBe(1);
    expect(x.defaultValue).toEqual([1, 1, 1]);
  });

  it("@color also promotes vec4 to color (RGBA) with white default", () => {
    const src = `uniform vec4 u_glow; // @color`;
    const x = parseUniforms(src).find((u) => u.name === "u_glow")!;
    expect(x.control).toBe("color");
    expect(x.defaultValue).toEqual([1, 1, 1, 1]);
  });

  it("@color is ignored for incompatible types (float)", () => {
    const src = `uniform float u_brightness; // @color`;
    const x = parseUniforms(src).find((u) => u.name === "u_brightness")!;
    expect(x.control).toBe("slider");
  });

  it("@slider reverts a color-named vec3 to per-channel sliders", () => {
    const src = `uniform vec3 u_baseColor; // @multi`;
    const x = parseUniforms(src).find((u) => u.name === "u_baseColor")!;
    expect(x.control).toBe("multi");
    expect(x.min).toBe(-1);
    expect(x.max).toBe(1);
  });

  it("@color + @default keeps the user default and the color control", () => {
    const src = `uniform vec3 u_tint; // @color @default 0.2,0.5,0.9`;
    const x = parseUniforms(src).find((u) => u.name === "u_tint")!;
    expect(x.control).toBe("color");
    expect(x.defaultValue).toEqual([0.2, 0.5, 0.9]);
  });

  it("explicit @label overrides name-pattern inference (precedence)", () => {
    const src = `
      // @label "Brightness"
      uniform float u_intensity;
    `;
    const x = parseUniforms(src).find((u) => u.name === "u_intensity")!;
    expect(x.label).toBe("Brightness");
    // name-pattern said intensity → 0..1, hint did not override, so retained:
    expect(x.min).toBe(0);
    expect(x.max).toBe(1);
  });

  it("explicit @range overrides name-pattern range", () => {
    // u_scale would otherwise pick 0..10 from the name pattern.
    const src = `uniform float u_scale; // @range -5..5`;
    const x = parseUniforms(src).find((u) => u.name === "u_scale")!;
    expect(x.min).toBe(-5);
    expect(x.max).toBe(5);
  });
});

describe("parseHintComment @color", () => {
  it("parses @color", () => {
    const h = parseHintComment("// @color");
    expect(h.control).toBe("color");
  });
  it("parses @slider", () => {
    expect(parseHintComment("// @slider").control).toBe("slider");
  });
  it("parses @multi", () => {
    expect(parseHintComment("// @multi").control).toBe("multi");
  });
  it("last control hint wins when combined", () => {
    expect(parseHintComment("// @color @slider").control).toBe("slider");
  });
});

describe("serializeHintComment", () => {
  it("emits canonical @range/@step/@default/@label", () => {
    const c = serializeHintComment("//", {
      min: 0,
      max: 5,
      step: 0.1,
      defaultValue: 2,
      label: "Intensity",
    });
    expect(c).toBe('// @range 0..5 @step 0.1 @default 2 @label "Intensity"');
  });

  it("emits a vector @default as comma list", () => {
    const c = serializeHintComment("//", { defaultValue: [0.2, 0.5, 0.9] });
    expect(c).toBe("// @default 0.2,0.5,0.9");
  });

  it("preserves free-text and replaces stale annotations", () => {
    const c = serializeHintComment("// blur kernel @range 0..1 @step 0.5", {
      min: 1,
      max: 9,
    });
    expect(c).toBe("// blur kernel @range 1..9");
  });

  it("returns a bare // when nothing remains", () => {
    expect(serializeHintComment("// @range 0..1", {})).toBe("//");
  });

  it("keeps free-text that trails a @default value (L9)", () => {
    // The @default strip token used to be greedy ([^@\n]+) and swallowed the
    // trailing note on round-trip; it must now match only the numeric value.
    const c = serializeHintComment("// @default 0.5 tweak me", {
      defaultValue: 0.25,
    });
    expect(c).toBe("// tweak me @default 0.25");
  });

  it("keeps free-text trailing a vector @default (L9)", () => {
    const c = serializeHintComment("// @default 1,0,0 base tint", {
      defaultValue: [0, 1, 0],
    });
    expect(c).toBe("// base tint @default 0,1,0");
  });

  it("uses @min/@max when only one bound is given", () => {
    expect(serializeHintComment("//", { min: -2 })).toBe("// @min -2");
    expect(serializeHintComment("//", { max: 3 })).toBe("// @max 3");
  });

  it("emits an explicit control flag", () => {
    expect(serializeHintComment("//", { control: "color" })).toContain(
      "@color",
    );
  });
});

describe("writeUniformHints", () => {
  it("writes a trailing comment onto a bare declaration", () => {
    const out = writeUniformHints("uniform float u_x;", "u_x", {
      min: 0,
      max: 10,
      defaultValue: 4,
    });
    expect(out).toBe("uniform float u_x; // @range 0..10 @default 4");
  });

  it("returns null when the uniform is absent", () => {
    expect(writeUniformHints("uniform float u_x;", "u_y", { min: 0 })).toBe(
      null,
    );
  });

  it("strips stale hints from a preceding comment line", () => {
    const src = `// @range -3..3 @step 0.1\nuniform float u_freq;`;
    const out = writeUniformHints(src, "u_freq", {
      min: 0,
      max: 5,
      step: 0.5,
    });
    expect(out).toBe("uniform float u_freq; // @range 0..5 @step 0.5");
  });

  it("keeps free-text on a preceding comment line", () => {
    const src = `// tweak me @range 0..1\nuniform float u_amount;`;
    const out = writeUniformHints(src, "u_amount", { min: 0, max: 2 });
    expect(out).toBe("// tweak me\nuniform float u_amount; // @range 0..2");
  });

  it("round-trips parse → edit → serialize → parse", () => {
    const src = `uniform float u_intensity; // @range 0..1 @default 0.5`;
    const out = writeUniformHints(src, "u_intensity", {
      min: -2,
      max: 8,
      step: 0.25,
      defaultValue: 3,
      label: "Power",
    })!;
    const spec = parseUniforms(out).find((u) => u.name === "u_intensity")!;
    expect(spec.min).toBe(-2);
    expect(spec.max).toBe(8);
    expect(spec.step).toBe(0.25);
    expect(spec.defaultValue).toBe(3);
    expect(spec.label).toBe("Power");
  });

  it("preserves a @color control across an edit", () => {
    const src = `uniform vec3 u_tint; // @color`;
    const out = writeUniformHints(src, "u_tint", {
      defaultValue: [0.1, 0.2, 0.3],
      control: "color",
    })!;
    const spec = parseUniforms(out).find((u) => u.name === "u_tint")!;
    expect(spec.control).toBe("color");
    expect(spec.defaultValue).toEqual([0.1, 0.2, 0.3]);
  });
});

describe("hint survival under comment masking (L20 blocker guard)", () => {
  // parseUniforms uses the BLOCK-ONLY masker on purpose: the trailing `//` run
  // is the hint source. Switching it to the combined masker makes
  // `line.indexOf("//")` return -1 for every line, silently deleting every
  // @range/@min/@max/@step/@default/@label/@color in the app.
  it("reads a trailing @range hint", () => {
    const u = parseUniforms("uniform float u_x; // @range 0..10")[0];
    expect(u?.min).toBe(0);
    expect(u?.max).toBe(10);
  });

  it("reads every managed annotation from a trailing comment", () => {
    const src = `uniform vec3 u_tint; // @color @range 0..2 @step 0.5 @default 1,1,1 @label "Tint"`;
    const u = parseUniforms(src)[0];
    expect(u?.control).toBe("color");
    expect(u?.min).toBe(0);
    expect(u?.max).toBe(2);
    expect(u?.step).toBe(0.5);
    expect(u?.defaultValue).toEqual([1, 1, 1]);
    expect(u?.label).toBe("Tint");
  });

  it("still ignores declarations inside a block comment", () => {
    const src = `/*
uniform float u_commented;
*/
uniform float u_real;
`;
    expect(parseUniforms(src).map((u) => u.name)).toEqual(["u_real"]);
  });

  it("keeps a trailing hint when a block comment shares the line", () => {
    const src = `uniform float u_x; /* note */ // @range 0..4`;
    const u = parseUniforms(src)[0];
    expect(u?.min).toBe(0);
    expect(u?.max).toBe(4);
  });
});

describe("writeUniformHints — block-comment awareness (L33)", () => {
  it("rewrites the live declaration, not a commented-out twin", () => {
    const src = `/*
uniform float u_x; // @range 0..1
*/
uniform float u_x;
`;
    const out = writeUniformHints(src, "u_x", { min: 0, max: 2 });
    expect(out).not.toBeNull();
    const lines = out!.split("\n");
    // The commented-out copy is untouched…
    expect(lines[1]).toBe("uniform float u_x; // @range 0..1");
    // …and the real declaration got the new range.
    expect(lines[3]).toBe("uniform float u_x; // @range 0..2");
  });

  it("preserves a block comment that sits before the trailing comment", () => {
    const src = `uniform float u_x; /* keep me */ // @range 0..1`;
    const out = writeUniformHints(src, "u_x", { min: 0, max: 3 });
    expect(out).toBe("uniform float u_x; /* keep me */ // @range 0..3");
  });

  it("is not fooled by a `//` that lives inside a block comment", () => {
    const src = `uniform float u_x; /* // */ // @range 0..1`;
    const out = writeUniformHints(src, "u_x", { min: 0, max: 5 });
    expect(out).toBe("uniform float u_x; /* // */ // @range 0..5");
  });
});

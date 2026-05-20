import { describe, expect, it } from "vitest";
import {
  inspectorUniforms,
  parseHintComment,
  parseUniforms,
  SYSTEM_UNIFORM_DESCRIPTIONS,
  SYSTEM_UNIFORMS,
  samplerUniforms,
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

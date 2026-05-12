import { describe, expect, it } from "vitest";
import type { UniformSpec } from "../../core/graph/uniformParser";
import {
  filterUniforms,
  matchesUniformQuery,
  normalizeUniformQuery,
} from "./uniformFilter";

function makeSpec(partial: Partial<UniformSpec> & Pick<UniformSpec, "name">) {
  return {
    type: "float",
    control: "slider",
    system: false,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    ...partial,
  } as UniformSpec;
}

describe("normalizeUniformQuery", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeUniformQuery("  Blur  ")).toBe("blur");
  });

  it("returns empty for whitespace-only input", () => {
    expect(normalizeUniformQuery("   ")).toBe("");
  });
});

describe("matchesUniformQuery", () => {
  it("matches against spec.name (case-insensitive substring)", () => {
    const spec = makeSpec({ name: "u_blurRadius" });
    expect(matchesUniformQuery(spec, "blur")).toBe(true);
    expect(matchesUniformQuery(spec, "radius")).toBe(true);
    expect(matchesUniformQuery(spec, "zzz")).toBe(false);
  });

  it("matches against spec.label when present", () => {
    const spec = makeSpec({ name: "u_x", label: "Tonemap exposure" });
    expect(matchesUniformQuery(spec, "tonemap")).toBe(true);
    expect(matchesUniformQuery(spec, "exposure")).toBe(true);
  });

  it("matches against spec.type", () => {
    const spec = makeSpec({ name: "u_color", type: "vec3" });
    expect(matchesUniformQuery(spec, "vec3")).toBe(true);
    expect(matchesUniformQuery(spec, "vec4")).toBe(false);
  });

  it("returns true for empty normalized query (no filter)", () => {
    const spec = makeSpec({ name: "u_anything" });
    expect(matchesUniformQuery(spec, "")).toBe(true);
  });

  it("does not match label when label is absent", () => {
    const spec = makeSpec({ name: "u_a" });
    expect(matchesUniformQuery(spec, "label")).toBe(false);
  });
});

describe("filterUniforms", () => {
  const specs = [
    makeSpec({ name: "u_time", type: "float", system: true }),
    makeSpec({ name: "u_blurRadius", type: "float", label: "Blur radius" }),
    makeSpec({ name: "u_color", type: "vec3", control: "color" }),
    makeSpec({ name: "u_count", type: "int" }),
  ];

  it("returns all specs when query is empty / whitespace", () => {
    expect(filterUniforms(specs, "")).toHaveLength(4);
    expect(filterUniforms(specs, "   ")).toHaveLength(4);
  });

  it("filters by name substring", () => {
    expect(filterUniforms(specs, "blur").map((s) => s.name)).toEqual([
      "u_blurRadius",
    ]);
  });

  it("filters by label substring (case-insensitive)", () => {
    expect(filterUniforms(specs, "RADIUS").map((s) => s.name)).toEqual([
      "u_blurRadius",
    ]);
  });

  it("filters by type", () => {
    expect(filterUniforms(specs, "vec3").map((s) => s.name)).toEqual([
      "u_color",
    ]);
    expect(filterUniforms(specs, "int").map((s) => s.name)).toEqual([
      "u_count",
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterUniforms(specs, "zzz")).toHaveLength(0);
  });

  it("returns a fresh array (does not mutate input)", () => {
    const out = filterUniforms(specs, "");
    expect(out).not.toBe(specs);
    expect(out).toHaveLength(specs.length);
  });
});

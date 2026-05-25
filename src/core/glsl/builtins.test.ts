import { describe, expect, it } from "vitest";
import {
  GLSL_FUNCTIONS,
  GLSL_KEYWORDS,
} from "../../ui/CodeEditor/autocomplete";
import { BUILTIN_FUNCTIONS, KEYWORD_DESCRIPTIONS } from "./builtins";

describe("BUILTIN_FUNCTIONS", () => {
  it("covers every name listed in GLSL_FUNCTIONS", () => {
    const missing = GLSL_FUNCTIONS.filter((fn) => !(fn in BUILTIN_FUNCTIONS));
    expect(missing).toEqual([]);
  });

  it("does not expose builtins outside of GLSL_FUNCTIONS (catches typos and drift)", () => {
    const known = new Set(GLSL_FUNCTIONS);
    const extras = Object.keys(BUILTIN_FUNCTIONS).filter((k) => !known.has(k));
    expect(extras).toEqual([]);
  });

  it("each entry carries at least one signature and a description", () => {
    for (const [name, spec] of Object.entries(BUILTIN_FUNCTIONS)) {
      expect(spec.signatures.length, name).toBeGreaterThan(0);
      // Signatures should look like `<retType> <name>(<args>)` — at minimum
      // they should contain the function's own name.
      for (const sig of spec.signatures) {
        expect(sig, `${name} signature: ${sig}`).toContain(name);
      }
      expect(spec.description.length, name).toBeGreaterThan(0);
    }
  });
});

describe("KEYWORD_DESCRIPTIONS", () => {
  it("covers the storage and control-flow keywords from GLSL_KEYWORDS", () => {
    const expected = [
      "uniform",
      "in",
      "out",
      "const",
      "return",
      "if",
      "for",
      "discard",
    ];
    for (const kw of expected) {
      expect(KEYWORD_DESCRIPTIONS).toHaveProperty(kw);
    }
  });

  it("every described keyword is one that autocomplete advertises", () => {
    const known = new Set(GLSL_KEYWORDS);
    for (const kw of Object.keys(KEYWORD_DESCRIPTIONS)) {
      expect(known.has(kw), `${kw} not in GLSL_KEYWORDS`).toBe(true);
    }
  });
});

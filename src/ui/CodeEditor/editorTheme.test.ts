import { describe, expect, it } from "vitest";
import { tokens, withAlpha } from "../../theme";
import { EDITOR_CHROME } from "./editorTheme";

describe("EDITOR_CHROME — semantic token classes (phase-26 class names, load-bearing)", () => {
  const variableClasses = [
    "uniform",
    "in",
    "out",
    "attribute",
    "varying",
    "parameter",
  ];

  it.each(
    variableClasses,
  )(".cm-glsl-token-%s → tokens.syntax.variable", (kind) => {
    expect(EDITOR_CHROME[`.cm-glsl-token-${kind}`]?.color).toBe(
      tokens.syntax.variable,
    );
  });

  it(".cm-glsl-token-system-uniform → tokens.semantic.warning", () => {
    expect(EDITOR_CHROME[".cm-glsl-token-system-uniform"]?.color).toBe(
      tokens.semantic.warning,
    );
  });

  it(".cm-glsl-token-const → tokens.syntax.keyword", () => {
    expect(EDITOR_CHROME[".cm-glsl-token-const"]?.color).toBe(
      tokens.syntax.keyword,
    );
  });

  it(".cm-glsl-token-struct-type → tokens.syntax.type", () => {
    expect(EDITOR_CHROME[".cm-glsl-token-struct-type"]?.color).toBe(
      tokens.syntax.type,
    );
  });

  it.each([
    "function-user",
    "function-builtin",
  ])(".cm-glsl-token-%s → tokens.syntax.function", (kind) => {
    expect(EDITOR_CHROME[`.cm-glsl-token-${kind}`]?.color).toBe(
      tokens.syntax.function,
    );
  });
});

describe("EDITOR_CHROME — reference-highlight classes (phase-27 class names, load-bearing)", () => {
  it(".cm-glsl-ref-occurrence uses a 16% accent tint", () => {
    expect(EDITOR_CHROME[".cm-glsl-ref-occurrence"]?.backgroundColor).toBe(
      withAlpha(tokens.accent.default, 0.16),
    );
  });

  it(".cm-glsl-ref-definition uses the same tint plus a 35% accent outline", () => {
    const def = EDITOR_CHROME[".cm-glsl-ref-definition"];
    expect(def?.backgroundColor).toBe(withAlpha(tokens.accent.default, 0.16));
    expect(def?.outline).toContain(withAlpha(tokens.accent.default, 0.35));
  });
});

import { tags as t } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { tokens, withAlpha } from "../../theme";
import { EDITOR_CHROME, glslHighlightStyle } from "./editorTheme";

/**
 * `HighlightStyle.specs` is the read-only array of `{ tag, ...style }`
 * entries passed to `HighlightStyle.define`. Each entry's `tag` is a lezer
 * `Tag` or `Tag[]`; the color case below re-derives the same tag values
 * declared in `editorTheme.ts` to look up the matching spec by array
 * membership rather than by re-implementing lezer's tag matching.
 */
function specColorFor(tag: unknown): string | undefined {
  for (const spec of glslHighlightStyle.specs) {
    const specTags = Array.isArray(spec.tag) ? spec.tag : [spec.tag];
    if (specTags.includes(tag)) return spec.color as string | undefined;
  }
  return undefined;
}

describe("glslHighlightStyle", () => {
  it("keyword / processingInstruction / macroName → tokens.syntax.keyword", () => {
    expect(specColorFor(t.keyword)).toBe(tokens.syntax.keyword);
    expect(specColorFor(t.processingInstruction)).toBe(tokens.syntax.keyword);
    expect(specColorFor(t.macroName)).toBe(tokens.syntax.keyword);
  });

  it("typeName / standard(typeName) → tokens.syntax.type", () => {
    expect(specColorFor(t.typeName)).toBe(tokens.syntax.type);
    expect(specColorFor(t.standard(t.typeName))).toBe(tokens.syntax.type);
  });

  it("variableName / propertyName / attributeName → tokens.syntax.variable", () => {
    expect(specColorFor(t.variableName)).toBe(tokens.syntax.variable);
    expect(specColorFor(t.propertyName)).toBe(tokens.syntax.variable);
    expect(specColorFor(t.attributeName)).toBe(tokens.syntax.variable);
  });

  it("function(variableName) / definition(function(variableName)) → tokens.syntax.function", () => {
    expect(specColorFor(t.function(t.variableName))).toBe(
      tokens.syntax.function,
    );
    expect(specColorFor(t.definition(t.function(t.variableName)))).toBe(
      tokens.syntax.function,
    );
  });

  it("number / bool → tokens.syntax.number", () => {
    expect(specColorFor(t.number)).toBe(tokens.syntax.number);
    expect(specColorFor(t.bool)).toBe(tokens.syntax.number);
  });

  it("comment → tokens.syntax.comment", () => {
    expect(specColorFor(t.comment)).toBe(tokens.syntax.comment);
  });

  it("string → tokens.syntax.string", () => {
    expect(specColorFor(t.string)).toBe(tokens.syntax.string);
  });
});

describe("EDITOR_CHROME — surfaces, active line, lint underlines, tooltips", () => {
  it("background is tokens.surface.app", () => {
    expect(EDITOR_CHROME["&"]?.backgroundColor).toBe(tokens.surface.app);
  });

  it("active line is a 7% accent tint", () => {
    expect(EDITOR_CHROME[".cm-activeLine"]?.backgroundColor).toBe(
      withAlpha(tokens.accent.default, 0.07),
    );
  });

  it("lint error underline includes tokens.semantic.error", () => {
    expect(EDITOR_CHROME[".cm-lintRange-error"]?.textDecoration).toContain(
      tokens.semantic.error,
    );
  });

  it("lint warning underline includes tokens.semantic.warning", () => {
    expect(EDITOR_CHROME[".cm-lintRange-warning"]?.textDecoration).toContain(
      tokens.semantic.warning,
    );
  });

  it("tooltip shell matches surface/radius/shadow tokens", () => {
    const tooltip = EDITOR_CHROME[".cm-tooltip"];
    expect(tooltip?.backgroundColor).toBe(tokens.surface.nodeCardSolid);
    expect(tooltip?.borderRadius).toBe(`${tokens.radius.overlay}px`);
    expect(tooltip?.boxShadow).toBe(tokens.shadow.overlayBar);
  });

  it("selected autocomplete row is a 14% accent tint", () => {
    expect(
      EDITOR_CHROME[
        ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]"
      ]?.backgroundColor,
    ).toBe(withAlpha(tokens.accent.default, 0.14));
  });
});

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

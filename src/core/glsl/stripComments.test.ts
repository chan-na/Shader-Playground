import { describe, expect, it } from "vitest";
import { maskBlockComments, maskComments } from "./stripComments";

describe("stripComments — length preservation (functional requirement)", () => {
  // `references.ts` / `semanticTokens.ts` advance a running `lineStart` by the
  // masked line's length to turn per-line regex indices into absolute document
  // offsets, and `rename.ts` feeds those offsets to CodeMirror as edit ranges.
  // A masker that shortened anything would silently corrupt every rename.
  const SAMPLES = [
    "uniform float u_x; // trailing\nvoid main() {}\n",
    "/* block */ uniform float u_x;\n",
    "/* multi\n   line\n   block */ float x;\n",
    "// only a line comment",
    "no comments at all\n",
    "/* unterminated\nstill inside\n",
    "a /* b */ c // d\ne\n",
    "crlf // comment\r\nnext line\r\n",
  ];

  for (const src of SAMPLES) {
    it(`preserves length and newlines for ${JSON.stringify(src)}`, () => {
      const block = maskBlockComments(src);
      const all = maskComments(src);
      expect(block.length).toBe(src.length);
      expect(all.length).toBe(src.length);
      // Newline positions must survive so line N of the mask is line N of the
      // source.
      expect(block.split("\n").map((l) => l.length)).toEqual(
        src.split("\n").map((l) => l.length),
      );
      expect(all.split("\n").map((l) => l.length)).toEqual(
        src.split("\n").map((l) => l.length),
      );
    });
  }
});

describe("maskComments — combined", () => {
  it("blanks block and line comments, keeping code intact", () => {
    const src = "float a = 1.0; /* x */ float b = 2.0; // y\nfloat c;\n";
    const out = maskComments(src);
    // `/* x */` (7) and `// y` (4) become spaces; the spaces that already
    // surrounded them are untouched.
    const expected = `float a = 1.0;${" ".repeat(9)}float b = 2.0;${" ".repeat(
      5,
    )}\nfloat c;\n`;
    expect(out).toBe(expected);
  });

  it("does not treat `//` inside a block comment as a line comment", () => {
    const src = "/* // */ float a;\n";
    expect(maskComments(src)).toBe("         float a;\n");
  });

  it("does not treat `/*` inside a line comment as a block start", () => {
    // The old regex-based strippers scanned for `/* … */` across the whole
    // source, so this `/*` paired with the `*/` two lines down and blanked the
    // real declaration in between.
    const src = "// /* opens?\nfloat kept = 1.0;\n// */ closes?\nfloat also;\n";
    const out = maskComments(src);
    expect(out).toContain("float kept = 1.0;");
    expect(out).toContain("float also;");
  });

  it("blanks an unterminated block comment through end of input", () => {
    const src = "float a;\n/* never closed\nfloat b;\n";
    const out = maskComments(src);
    expect(out).toBe("float a;\n               \n        \n");
  });

  it("leaves a source with no slash untouched", () => {
    const src = "float a = 1.0;\n";
    expect(maskComments(src)).toBe(src);
    expect(maskBlockComments(src)).toBe(src);
  });

  it("keeps a lone division operator", () => {
    const src = "float a = b / c;\n";
    expect(maskComments(src)).toBe(src);
  });
});

describe("maskBlockComments — block only", () => {
  it("keeps line comments verbatim (they carry uniform hints)", () => {
    const src = "uniform float u_x; // @range 0..10\n";
    expect(maskBlockComments(src)).toBe(src);
  });

  it("blanks block comments while leaving a trailing line comment alone", () => {
    const src = "uniform float u_x; /* note */ // @range 0..10\n";
    expect(maskBlockComments(src)).toBe(
      "uniform float u_x;            // @range 0..10\n",
    );
  });

  it("does not start a block comment inside a line comment", () => {
    const src = "// /* opens?\nuniform float u_kept;\n";
    expect(maskBlockComments(src)).toBe(src);
  });
});

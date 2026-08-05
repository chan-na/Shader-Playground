import { describe, expect, it } from "vitest";
import {
  computeSilentUniformWarnings,
  silentWarningMessage,
} from "./silentUniforms";
import { parseUniforms } from "./uniformParser";

describe("computeSilentUniformWarnings", () => {
  it("flags an active sampler with no bound edge as sampler-unconnected", () => {
    const declared = parseUniforms("uniform sampler2D u_tex;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_tex"]),
      new Set(),
      new Set(),
    );
    expect(warnings).toEqual([
      { uniformName: "u_tex", kind: "sampler-unconnected" },
    ]);
  });

  it("flags a declared-but-never-active uniform as uniform-inactive", () => {
    const declared = parseUniforms("uniform float u_ghost;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(),
      new Set(),
      new Set(),
    );
    expect(warnings).toEqual([
      { uniformName: "u_ghost", kind: "uniform-inactive" },
    ]);
  });

  it("produces no warning for an active, bound sampler", () => {
    const declared = parseUniforms("uniform sampler2D u_tex;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_tex"]),
      new Set(["u_tex"]),
      new Set(),
    );
    expect(warnings).toEqual([]);
  });

  it("produces no warning for an active, non-sampler uniform regardless of binding", () => {
    const declared = parseUniforms("uniform float u_amount;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_amount"]),
      new Set(),
      new Set(),
    );
    expect(warnings).toEqual([]);
  });

  it("flags a declared system uniform as uniform-inactive when the optimizer stripped it (system:true is not an exemption)", () => {
    const declared = parseUniforms("uniform float u_time;");
    expect(declared[0]?.system).toBe(true);
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(),
      new Set(),
      new Set(),
    );
    expect(warnings).toEqual([
      { uniformName: "u_time", kind: "uniform-inactive" },
    ]);
  });

  it("treats a paramBinding-bound active float as fully accounted for (no warning)", () => {
    const declared = parseUniforms("uniform float u_strength;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_strength"]),
      new Set(["u_strength"]),
      new Set(),
    );
    expect(warnings).toEqual([]);
  });

  // [9]/[12]: an edge is not a binding. `execute.ts`'s `bindSamplers`
  // `continue`s over a connected sampler whose source produces no texture
  // (image with no assetId, asset that never loaded), so the unit is never
  // assigned — the "bound" set alone cannot tell the truth here.
  it("flags a bound sampler whose source has no texture as sampler-source-empty", () => {
    const declared = parseUniforms("uniform sampler2D u_tex;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_tex"]),
      new Set(["u_tex"]),
      new Set(["u_tex"]),
    );
    expect(warnings).toEqual([
      { uniformName: "u_tex", kind: "sampler-source-empty" },
    ]);
  });

  it("prefers sampler-unconnected over sampler-source-empty when there is no edge at all", () => {
    const declared = parseUniforms("uniform sampler2D u_tex;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_tex"]),
      new Set(),
      new Set(["u_tex"]),
    );
    expect(warnings).toEqual([
      { uniformName: "u_tex", kind: "sampler-unconnected" },
    ]);
  });

  it("does not flag a non-sampler uniform listed as empty-source", () => {
    const declared = parseUniforms("uniform float u_amount;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_amount"]),
      new Set(["u_amount"]),
      new Set(["u_amount"]),
    );
    expect(warnings).toEqual([]);
  });

  it("preserves declaration order across multiple warnings", () => {
    const declared = parseUniforms(
      "uniform sampler2D u_a;\nuniform float u_b;\nuniform sampler2D u_c;",
    );
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_a", "u_c"]),
      new Set(),
      new Set(),
    );
    expect(warnings).toEqual([
      { uniformName: "u_a", kind: "sampler-unconnected" },
      { uniformName: "u_b", kind: "uniform-inactive" },
      { uniformName: "u_c", kind: "sampler-unconnected" },
    ]);
  });
});

describe("silentWarningMessage", () => {
  // Acceptance criterion: the message must not assert "black is sampled" —
  // an unconnected sampler's uniform stays at 0, so it reads texture unit 0,
  // which holds another texture whenever the same pass has any connected
  // sampler (compile.ts assigns connected samplers units starting at 0).
  // Black is only one of the possible outcomes, so the wording has to stay
  // non-assertive ("...일 수 있습니다").
  //
  // The tuple itself is (0,0,0,1), not (0,0,0,0): GLES 3.0 §3.8.13 (inherited
  // by WebGL2) defines an incomplete/unbound texture lookup as opaque black,
  // which is why `execute.ts`'s placeholder is `[0, 0, 0, 255]`. The alpha
  // channel is exactly what `if (m.a < 0.5) discard;` keys off, so a wrong
  // alpha sends the reader to the opposite conclusion.
  it("names the uniform and stays non-assertive about what an unconnected sampler reads", () => {
    const msg = silentWarningMessage({
      uniformName: "u_tex",
      kind: "sampler-unconnected",
    });
    expect(msg).toContain("u_tex");
    expect(msg).toContain("(0,0,0,1)");
    expect(msg).not.toContain("(0,0,0,0)");
    expect(msg).toContain("수 있습니다");
    expect(msg).not.toContain("샘플링됩니다");
  });

  // Acceptance criterion: say that the edge exists but the source is empty
  // (otherwise the reader hunts for a missing connection that is right
  // there), and stay non-assertive about what unit 0 actually holds — it is
  // whatever unrelated texture a previous draw left bound, not "the previous
  // frame's composite result" (compositeOutputs draws to the default
  // framebuffer and produces no texture).
  it("says the source is empty rather than unconnected, and stays non-assertive about unit 0", () => {
    const msg = silentWarningMessage({
      uniformName: "u_tex",
      kind: "sampler-source-empty",
    });
    expect(msg).toContain("u_tex");
    expect(msg).toContain("연결");
    expect(msg).toContain("유닛 0");
    expect(msg).toContain("수 있습니다");
    expect(msg).not.toContain("샘플링됩니다");
  });

  // Acceptance criterion: the optimizer-vs-typo ambiguity must never be
  // asserted away — the message has to stay non-assertive ("...일 수
  // 있습니다"), not claim certainty about which case it is. [26]: the cause
  // list must also name the preprocessor branch, because `parseUniforms` is a
  // line scanner that puts `#ifdef`-disabled declarations into `declared`;
  // enumerating only optimizer-removal and typos sends that user hunting for
  // a typo that does not exist.
  it("uses non-assertive, cause-neutral wording for uniform-inactive (optimizer removal, typo, or preprocessor branch)", () => {
    const msg = silentWarningMessage({
      uniformName: "u_ghost",
      kind: "uniform-inactive",
    });
    expect(msg).toContain("u_ghost");
    expect(msg).toContain("수 있습니다");
    expect(msg).toContain("#ifdef");
  });
});

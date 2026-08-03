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
    );
    expect(warnings).toEqual([]);
  });

  it("produces no warning for an active, non-sampler uniform regardless of binding", () => {
    const declared = parseUniforms("uniform float u_amount;");
    const warnings = computeSilentUniformWarnings(
      declared,
      new Set(["u_amount"]),
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
  it("names the uniform and stays non-assertive about what an unconnected sampler reads", () => {
    const msg = silentWarningMessage({
      uniformName: "u_tex",
      kind: "sampler-unconnected",
    });
    expect(msg).toContain("u_tex");
    expect(msg).toContain("(0,0,0,0)");
    expect(msg).toContain("수 있습니다");
    expect(msg).not.toContain("샘플링됩니다");
  });

  // Acceptance criterion: the optimizer-vs-typo ambiguity must never be
  // asserted away — the message has to stay non-assertive ("...일 수
  // 있습니다"), not claim certainty about which case it is.
  it("uses non-assertive wording for uniform-inactive (can't distinguish optimizer removal from a typo)", () => {
    const msg = silentWarningMessage({
      uniformName: "u_ghost",
      kind: "uniform-inactive",
    });
    expect(msg).toContain("u_ghost");
    expect(msg).toContain("수 있습니다");
  });
});

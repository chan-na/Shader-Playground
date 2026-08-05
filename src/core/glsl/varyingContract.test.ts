import { describe, expect, it } from "vitest";
import basicVert from "../../shaders/basic.vert?raw";
import fullscreenVert from "../../shaders/fullscreen.vert?raw";
import starterFrag from "../../shaders/templates/starter.frag?raw";
import {
  computeVaryingContract,
  confidentVaryingWarnings,
  type VaryingRow,
  type VaryingStatus,
  varyingWarningMessage,
} from "./varyingContract";

function rowByName(
  rows: ReturnType<typeof computeVaryingContract>["rows"],
  name: string,
) {
  return rows.find((r) => r.name === name);
}

/** Asserts a row's status against the exported union, not a bare string. */
function expectStatus(row: VaryingRow | undefined, status: VaryingStatus) {
  expect(row?.status).toBe(status);
}

describe("computeVaryingContract", () => {
  it("links fullscreen.vert against starter.frag — the mesh-less first-frame pairing (v_uv only)", () => {
    const c = computeVaryingContract(fullscreenVert, starterFrag);
    expect(c.confident).toBe(true);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]?.name).toBe("v_uv");
    expectStatus(c.rows[0], "linked");
    expect(c.rows[0]?.vertexType).toBe("vec2");
    expect(c.rows[0]?.fragmentType).toBe("vec2");
  });

  it("reports basic.vert's unread varyings as unused when the fragment only consumes v_uv", () => {
    const frag = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}
`;
    const c = computeVaryingContract(basicVert, frag);
    expect(c.confident).toBe(true);
    expectStatus(rowByName(c.rows, "v_uv"), "linked");
    expectStatus(rowByName(c.rows, "v_normal"), "unused");
    expectStatus(rowByName(c.rows, "v_world"), "unused");
    expect(c.rows.map((r) => r.name).sort()).toEqual([
      "v_normal",
      "v_uv",
      "v_world",
    ]);
  });

  it("flags a fragment-only, statically-used varying as missing-out with a fragmentLine and a confident warning", () => {
    const vert = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec3 v_foo;
out vec4 outColor;
void main() {
  outColor = vec4(v_foo, 1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(true);
    const row = rowByName(c.rows, "v_foo");
    expectStatus(row, "missing-out");
    expect(row?.vertexType).toBeNull();
    expect(row?.fragmentType).toBe("vec3");
    expect(row?.fragmentUsed).toBe(true);
    expect(row?.fragmentLine).toBe(3);

    const warnings = confidentVaryingWarnings(c);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.name).toBe("v_foo");
    expect(varyingWarningMessage(warnings[0]!)).toContain("v_foo");
    expect(varyingWarningMessage(warnings[0]!)).toContain("링크");
  });

  it("does not warn on a declared-but-never-referenced fragment input (statically unused)", () => {
    const vert = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec2 v_ghost;
out vec4 outColor;
void main() {
  outColor = vec4(1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    const row = rowByName(c.rows, "v_ghost");
    expectStatus(row, "missing-out");
    expect(row?.fragmentUsed).toBe(false);
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("flags a type mismatch between a used vertex out and fragment in of the same name", () => {
    const vert = `#version 300 es
out vec2 v_x;
void main() {
  v_x = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec3 v_x;
out vec4 outColor;
void main() {
  outColor = vec4(v_x, 1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    const row = rowByName(c.rows, "v_x");
    expectStatus(row, "type-mismatch");
    expect(row?.vertexType).toBe("vec2");
    expect(row?.fragmentType).toBe("vec3");
    const warnings = confidentVaryingWarnings(c);
    expect(warnings).toHaveLength(1);
    const msg = varyingWarningMessage(warnings[0]!);
    expect(msg).toContain("vec2");
    expect(msg).toContain("vec3");
  });

  it("withdraws confidence (and every warning) when the fragment has a preprocessor branch", () => {
    const vert = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
#ifdef USE_FOO
in vec2 v_foo;
#endif
out vec4 outColor;
void main() {
  outColor = vec4(1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(false);
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("withdraws confidence when a stage declares a GLSL interface block", () => {
    const vert = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
out VS_OUT { vec3 v; } vs;
out vec4 outColor;
void main() {
  outColor = vec4(1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(false);
  });

  it("ignores a commented-out varying declaration", () => {
    const vert = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
// in vec2 v_hidden;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(rowByName(c.rows, "v_hidden")).toBeUndefined();
    expect(c.rows.map((r) => r.name)).toEqual(["v_uv"]);
  });

  it("matches a flat-qualified varying across both stages without a false warning", () => {
    const vert = `#version 300 es
flat out int v_id;
void main() {
  v_id = 1;
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
flat in int v_id;
out vec4 outColor;
void main() {
  outColor = vec4(float(v_id));
}
`;
    const c = computeVaryingContract(vert, frag);
    const row = rowByName(c.rows, "v_id");
    expectStatus(row, "linked");
    expect(row?.vertexType).toBe("int");
    expect(row?.fragmentType).toBe("int");
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("links every declarator of a comma multi-declaration without a false warning", () => {
    // `out vec2 v_uv, v_st;` is legal GLSL that the single-declarator
    // RE_STORAGE_DECL used to reject wholesale — both names vanished from
    // the vertex table and surfaced as *confident* missing-out warnings
    // while the real program linked fine. The symbol table now harvests
    // every declarator (see its declarator walk), so both rows must be
    // linked, confident, and warning-free.
    const vert = `#version 300 es
in vec2 a_uv;
out vec2 v_uv, v_st;
void main() {
  v_uv = a_uv;
  v_st = a_uv * 2.0;
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_st;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, v_st);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(true);
    expectStatus(rowByName(c.rows, "v_uv"), "linked");
    expectStatus(rowByName(c.rows, "v_st"), "linked");
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("matches a comma multi-declaration on the fragment side too", () => {
    const vert = `#version 300 es
out vec2 v_uv;
out vec2 v_st;
void main() {
  v_uv = vec2(0.0);
  v_st = vec2(1.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec2 v_uv, v_st;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, v_st);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(true);
    expectStatus(rowByName(c.rows, "v_uv"), "linked");
    expectStatus(rowByName(c.rows, "v_st"), "linked");
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("withdraws confidence when a storage declaration wraps across lines", () => {
    // The line-oriented symbol table cannot harvest the `v_st` carried onto
    // the second line — reporting it "missing" would be a confident false
    // alarm, so the whole verdict is held instead (same ladder as the
    // preprocessor/interface-block hazards).
    const vert = `#version 300 es
out vec2 v_uv,
  v_st;
void main() {
  v_uv = vec2(0.0);
  v_st = vec2(1.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_st;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, v_st);
}
`;
    const c = computeVaryingContract(vert, frag);
    expect(c.confident).toBe(false);
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("matches ES1-style varying/varying declarations", () => {
    const vert = `varying vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const frag = `precision mediump float;
varying vec2 v_uv;
void main() {
  gl_FragColor = vec4(v_uv, 0.0, 1.0);
}
`;
    const c = computeVaryingContract(vert, frag);
    const row = rowByName(c.rows, "v_uv");
    expectStatus(row, "linked");
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });
});

describe("varyingWarningMessage", () => {
  it("stays non-assertive about the outcome of a missing vertex output", () => {
    const msg = varyingWarningMessage({
      name: "v_foo",
      vertexType: null,
      fragmentType: "vec3",
      fragmentUsed: true,
      status: "missing-out",
    });
    expect(msg).toContain("v_foo");
    expect(msg).toContain("수 있습니다");
  });

  it("names both types for a type-mismatch warning", () => {
    const msg = varyingWarningMessage({
      name: "v_x",
      vertexType: "vec2",
      fragmentType: "vec3",
      fragmentUsed: true,
      status: "type-mismatch",
    });
    expect(msg).toContain("vec2");
    expect(msg).toContain("vec3");
    expect(msg).toContain("수 있습니다");
  });
});

describe("qualifier / array-size disagreement (T4/M4-2 regression)", () => {
  // GLSL ES 3.0 rejects both of these at link time, but the type token alone
  // compares equal — so the row used to render a confident `linked` ✓ beside
  // a program that does not link. Confidence is now withdrawn instead.
  const vertOf = (decl: string) => `#version 300 es
in vec3 a_position;
${decl}
void main() { gl_Position = vec4(a_position, 1.0); }
`;
  const fragOf = (decl: string) => `#version 300 es
precision highp float;
${decl}
out vec4 outColor;
void main() { outColor = vec4(float(v_id), 0.0, 0.0, 1.0); }
`;

  it("withdraws confidence when the interpolation qualifier differs", () => {
    const c = computeVaryingContract(
      vertOf("flat out int v_id;"),
      fragOf("in int v_id;"),
    );
    expect(c.confident).toBe(false);
  });

  it("withdraws confidence when the array size differs", () => {
    const c = computeVaryingContract(
      vertOf("out float v_id[2];"),
      fragOf("in float v_id[3];"),
    );
    expect(c.confident).toBe(false);
  });

  it("keeps confidence when both stages agree on `flat`", () => {
    const c = computeVaryingContract(
      vertOf("flat out int v_id;"),
      fragOf("flat in int v_id;"),
    );
    expect(c.confident).toBe(true);
    expect(c.rows.find((r) => r.name === "v_id")?.status).toBe("linked");
  });

  it("treats an omitted `smooth` as agreeing with an explicit one", () => {
    // `smooth` is the default; writing it on one side only is not a mismatch
    // and must not cost the shader its ✓.
    const c = computeVaryingContract(
      vertOf("smooth out float v_id;"),
      fragOf("in float v_id;"),
    );
    expect(c.confident).toBe(true);
    expect(c.rows.find((r) => r.name === "v_id")?.status).toBe("linked");
  });

  it("does not let a superstring neighbour stand in for the varying being checked", () => {
    // `v_id2` is declared *above* `v_id` on both stages. Without the `\b`
    // anchor after the name, looking up `v_id` matched the `v_id2` line
    // first, so both stages reported `v_id2`'s signature — identical, so
    // `v_id`'s real flat/smooth split compared equal and the ✓ came back
    // beside a program that does not link.
    const c = computeVaryingContract(
      vertOf("flat out float v_id2;\nflat out float v_id;"),
      fragOf("flat in float v_id2;\nin float v_id;"),
    );
    expect(c.confident).toBe(false);
  });

  it("keeps confidence when the superstring neighbour and the varying both agree", () => {
    // The anchor must not degrade into blanket silence: the same
    // two-declaration shape with matching qualifiers keeps its ✓.
    const c = computeVaryingContract(
      vertOf("flat out float v_id2;\nflat out float v_id;"),
      fragOf("flat in float v_id2;\nflat in float v_id;"),
    );
    expect(c.confident).toBe(true);
    expect(c.rows.find((r) => r.name === "v_id")?.status).toBe("linked");
    expect(c.rows.find((r) => r.name === "v_id2")?.status).toBe("linked");
  });

  it("withdraws confidence when a symbolic array size faces a literal one", () => {
    // `[N]` is a legal constant expression, but `RE_STORAGE_DECL`'s
    // decimal-only array suffix rejected the vertex line wholesale — `v_id`
    // vanished from the vertex table and the fragment's input resurfaced as a
    // *confident* missing-out warning. Both stages are parsed now, and
    // `[N]` vs `[2]` is a real disagreement, so the verdict is held instead.
    const c = computeVaryingContract(
      vertOf("const int N = 2;\nout float v_id[N];"),
      fragOf("in float v_id[2];"),
    );
    expect(c.confident).toBe(false);
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("keeps confidence when both stages spell the same literal array size", () => {
    const c = computeVaryingContract(
      vertOf("out float v_id[2];"),
      fragOf("in float v_id[2];"),
    );
    expect(c.confident).toBe(true);
    expect(c.rows.find((r) => r.name === "v_id")?.status).toBe("linked");
  });
});

describe("unterminated block comment (T4/M4 regression)", () => {
  // `maskComments` blanks an unterminated `/*` all the way to EOF, so every
  // declaration below it disappears from the masked source the diff is
  // computed over — and none of the masked-source hazards can fire on a file
  // that now looks perfectly clean. The verdict is held on the *raw* source
  // instead, in both stage directions.
  const VERT = `#version 300 es
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
  const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}
`;

  it("withdraws confidence when the vertex stage never closes a block comment", () => {
    // The vertex `out` is swallowed by the half-typed opener, so the
    // fragment's input used to come back as a confident missing-out warning
    // for a varying the vertex stage does declare.
    const vert = `#version 300 es
/* TODO: document the UV convention
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const c = computeVaryingContract(vert, FRAG);
    expect(c.confident).toBe(false);
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("withdraws confidence when the fragment stage never closes a block comment", () => {
    // The mirror direction: the fragment's inputs vanish instead, so every
    // vertex output reads `unused`. No warning is produced either way, but
    // that fabricated diff must not be presented as a settled verdict — the
    // ✓ is withheld too (see `VaryingContract.confident`).
    const frag = `#version 300 es
precision highp float;
/* TODO: document the UV convention
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, 0.0, 1.0);
}
`;
    const c = computeVaryingContract(VERT, frag);
    expect(c.confident).toBe(false);
    expectStatus(rowByName(c.rows, "v_uv"), "unused");
    expect(confidentVaryingWarnings(c)).toHaveLength(0);
  });

  it("keeps confidence when the block comment is properly closed", () => {
    const vert = `#version 300 es
/* UV origin is bottom-left. */
out vec2 v_uv;
void main() {
  v_uv = vec2(0.0);
  gl_Position = vec4(0.0);
}
`;
    const c = computeVaryingContract(vert, FRAG);
    expect(c.confident).toBe(true);
    expectStatus(rowByName(c.rows, "v_uv"), "linked");
  });
});

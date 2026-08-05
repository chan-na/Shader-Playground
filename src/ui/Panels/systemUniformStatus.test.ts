import { describe, expect, it } from "vitest";
import { systemUniformBinding } from "./systemUniformStatus";

/**
 * Full 8-uniform × 3-context matrix, mirroring execute.ts's actual binding
 * decisions (bindSystemUniforms / bindComputeSystemUniforms) so this table
 * can never silently drift from what the renderer does.
 */
const SYSTEM_UNIFORM_NAMES = [
  "u_time",
  "u_resolution",
  "u_view",
  "u_proj",
  "u_model",
  "u_camera",
  "u_mouse",
  "u_frame",
] as const;

describe("systemUniformBinding", () => {
  describe("shader owner, fullscreen pass", () => {
    it.each(SYSTEM_UNIFORM_NAMES)("%s", (name) => {
      const info = systemUniformBinding(name, "shader", true, true);
      if (
        name === "u_view" ||
        name === "u_proj" ||
        name === "u_model" ||
        name === "u_camera"
      ) {
        expect(info).toEqual({
          bound: false,
          note: "not bound (fullscreen pass)",
        });
      } else {
        expect(info).toEqual({ bound: true });
      }
    });
  });

  describe("shader owner, mesh (non-fullscreen) pass", () => {
    it.each(SYSTEM_UNIFORM_NAMES)("%s is bound", (name) => {
      expect(systemUniformBinding(name, "shader", false, true)).toEqual({
        bound: true,
      });
    });
  });

  describe("compute owner", () => {
    it.each(SYSTEM_UNIFORM_NAMES)("%s", (name) => {
      const info = systemUniformBinding(name, "compute", false, true);
      if (name === "u_time" || name === "u_frame") {
        expect(info).toEqual({ bound: true });
      } else {
        expect(info).toEqual({
          bound: false,
          note: "not bound (compute pass)",
        });
      }
    });

    it("ignores isFullscreen entirely (compute has no such notion)", () => {
      for (const name of SYSTEM_UNIFORM_NAMES) {
        expect(systemUniformBinding(name, "compute", true, true)).toEqual(
          systemUniformBinding(name, "compute", false, true),
        );
      }
    });
  });

  // [#10] A node whose program failed to build is dropped from the plan's
  // passes (compile.ts `continue`s before `passes.push`) but keeps its
  // `fullscreenByNode` entry — and a shader error is not fatal validation, so
  // the rest of the plan is still published. Nothing runs for that node, so
  // nothing is bound for it either, whatever the per-name rules say.
  describe("no pass for the node", () => {
    it.each(SYSTEM_UNIFORM_NAMES)("%s is unbound (shader, mesh)", (name) => {
      expect(systemUniformBinding(name, "shader", false, false)).toEqual({
        bound: false,
        note: "not bound (no pass for this node)",
      });
    });

    it.each(SYSTEM_UNIFORM_NAMES)("%s is unbound (compute)", (name) => {
      const info = systemUniformBinding(name, "compute", false, false);
      expect(info.bound).toBe(false);
      expect(info.note).toBe(
        name === "u_time" || name === "u_frame"
          ? "not bound (no pass for this node)"
          : "not bound (compute pass)",
      );
    });

    // Both reasons are true at once when a fullscreen-substituted program
    // fails to link (the default demo's unlit.frag does exactly that: it reads
    // a varying fullscreen.vert never emits). The substitution is the
    // actionable one, so it keeps the note — phase-36's C-1 spec asserts that
    // exact string after disconnecting the mesh.
    it("keeps the fullscreen note for view-dependent names", () => {
      expect(systemUniformBinding("u_view", "shader", true, false)).toEqual({
        bound: false,
        note: "not bound (fullscreen pass)",
      });
      expect(systemUniformBinding("u_time", "shader", true, false)).toEqual({
        bound: false,
        note: "not bound (no pass for this node)",
      });
    });
  });

  it("treats an unknown uniform name as bound outside the view-dependent set", () => {
    expect(systemUniformBinding("u_custom", "shader", true, true)).toEqual({
      bound: true,
    });
    expect(systemUniformBinding("u_custom", "compute", false, true)).toEqual({
      bound: false,
      note: "not bound (compute pass)",
    });
  });
});

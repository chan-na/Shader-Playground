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
      const info = systemUniformBinding(name, "shader", true);
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
      expect(systemUniformBinding(name, "shader", false)).toEqual({
        bound: true,
      });
    });
  });

  describe("compute owner", () => {
    it.each(SYSTEM_UNIFORM_NAMES)("%s", (name) => {
      const info = systemUniformBinding(name, "compute", false);
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
        expect(systemUniformBinding(name, "compute", true)).toEqual(
          systemUniformBinding(name, "compute", false),
        );
      }
    });
  });

  it("treats an unknown uniform name as bound outside the view-dependent set", () => {
    expect(systemUniformBinding("u_custom", "shader", true)).toEqual({
      bound: true,
    });
    expect(systemUniformBinding("u_custom", "compute", false)).toEqual({
      bound: false,
      note: "not bound (compute pass)",
    });
  });
});

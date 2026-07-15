import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_BASE, exportFileName } from "./exportFileName";

describe("exportFileName", () => {
  it("matches the dc L549-551 reference value exactly", () => {
    expect(
      exportFileName("untitled-project", "html", new Date(2026, 6, 14, 15, 32)),
    ).toBe("untitled-project-20260714-1532.html");
  });

  it("zero-pads month/day/hour/minute", () => {
    expect(exportFileName("clip", "gif", new Date(2026, 0, 5, 9, 7))).toBe(
      "clip-20260105-0907.gif",
    );
  });

  it("slugifies spaces and symbols in the base name", () => {
    expect(
      exportFileName("My Shader!", "html", new Date(2026, 6, 14, 15, 32)),
    ).toBe("my-shader-20260714-1532.html");
    expect(exportFileName("A  B", "html", new Date(2026, 6, 14, 15, 32))).toBe(
      "a-b-20260714-1532.html",
    );
  });

  it("falls back to DEFAULT_EXPORT_BASE when the slug would be empty", () => {
    expect(exportFileName("   ", "html", new Date(2026, 6, 14, 15, 32))).toBe(
      `${DEFAULT_EXPORT_BASE}-20260714-1532.html`,
    );
    expect(exportFileName("!!!", "html", new Date(2026, 6, 14, 15, 32))).toBe(
      `${DEFAULT_EXPORT_BASE}-20260714-1532.html`,
    );
  });

  it("DEFAULT_EXPORT_BASE matches the dc reference base name", () => {
    expect(DEFAULT_EXPORT_BASE).toBe("untitled-project");
  });
});

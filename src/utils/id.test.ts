import { describe, expect, it } from "vitest";
import { nextId } from "./id";

describe("nextId", () => {
  it("prefixes with the supplied tag", () => {
    expect(nextId("mesh")).toMatch(/^mesh_/);
    expect(nextId("image")).toMatch(/^image_/);
  });

  it("returns unique values across consecutive calls", () => {
    const a = nextId("x");
    const b = nextId("x");
    expect(a).not.toBe(b);
  });
});

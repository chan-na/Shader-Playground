import { describe, expect, it } from "vitest";
import { glPrimitiveLabel } from "./primitiveLabel";

describe("glPrimitiveLabel", () => {
  it("maps every standard WebGL2 draw-mode constant to its name", () => {
    expect(glPrimitiveLabel(0)).toBe("POINTS");
    expect(glPrimitiveLabel(1)).toBe("LINES");
    expect(glPrimitiveLabel(2)).toBe("LINE_LOOP");
    expect(glPrimitiveLabel(3)).toBe("LINE_STRIP");
    expect(glPrimitiveLabel(4)).toBe("TRIANGLES");
    expect(glPrimitiveLabel(5)).toBe("TRIANGLE_STRIP");
    expect(glPrimitiveLabel(6)).toBe("TRIANGLE_FAN");
  });

  it("falls back to a hex literal for unknown constants", () => {
    expect(glPrimitiveLabel(0x0007)).toBe("0x7");
    expect(glPrimitiveLabel(999)).toBe("0x3e7");
  });
});

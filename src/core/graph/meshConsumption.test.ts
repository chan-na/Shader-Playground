import { describe, expect, it } from "vitest";
import { aggregateMeshConsumption } from "./meshConsumption";

const CONTRACT = [
  { name: "a_position" },
  { name: "a_normal" },
  { name: "a_uv" },
];

describe("aggregateMeshConsumption", () => {
  it("marks every attribute unknown when there are no consumers at all", () => {
    const out = aggregateMeshConsumption(CONTRACT, []);
    expect(out).toEqual({
      a_position: "unknown",
      a_normal: "unknown",
      a_uv: "unknown",
    });
  });

  it("marks an attribute consumed when a single consumer bound it", () => {
    const out = aggregateMeshConsumption(CONTRACT, [
      [
        { name: "a_position", consumed: true },
        { name: "a_normal", consumed: true },
        { name: "a_uv", consumed: true },
      ],
    ]);
    expect(out).toEqual({
      a_position: "consumed",
      a_normal: "consumed",
      a_uv: "consumed",
    });
  });

  it("marks an attribute skipped when its only consumer(s) declared but never bound it", () => {
    const out = aggregateMeshConsumption(CONTRACT, [
      [
        { name: "a_position", consumed: true },
        { name: "a_normal", consumed: false },
        { name: "a_uv", consumed: false },
      ],
    ]);
    expect(out).toEqual({
      a_position: "consumed",
      a_normal: "skipped",
      a_uv: "skipped",
    });
  });

  it("marks an attribute unknown when no consumer's list even mentions its name", () => {
    const out = aggregateMeshConsumption(CONTRACT, [
      [{ name: "a_position", consumed: true }],
    ]);
    expect(out).toEqual({
      a_position: "consumed",
      a_normal: "unknown",
      a_uv: "unknown",
    });
  });

  it("uses any-consumed semantics across multiple consumers", () => {
    const out = aggregateMeshConsumption(CONTRACT, [
      [
        { name: "a_position", consumed: true },
        { name: "a_normal", consumed: false },
        { name: "a_uv", consumed: false },
      ],
      [
        { name: "a_position", consumed: false },
        { name: "a_normal", consumed: true },
      ],
    ]);
    expect(out).toEqual({
      a_position: "consumed",
      a_normal: "consumed",
      a_uv: "skipped",
    });
  });
});

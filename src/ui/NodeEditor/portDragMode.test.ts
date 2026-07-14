import { describe, expect, it } from "vitest";
import type {
  ConnectionDragSource,
  SnapPulse,
} from "../../state/connectionUiStore";
import { portDragMode, snapSeqFor } from "./portDragMode";

const floatOut: ConnectionDragSource = {
  nodeId: "n1",
  handleId: "value",
  side: "out",
  portType: "float",
};

describe("portDragMode", () => {
  it("idle when no drag is in progress", () => {
    expect(
      portDragMode({ name: "value", type: "float" }, "in", "n2", null),
    ).toBe("idle");
  });

  it("origin when node/handle/side all match the drag source", () => {
    expect(
      portDragMode({ name: "value", type: "float" }, "out", "n1", floatOut),
    ).toBe("origin");
  });

  it("not origin when node/handle match but side does not", () => {
    // Same node+handle name but queried from the "in" side — the drag
    // source itself is an output, so this can never be the origin port.
    expect(
      portDragMode({ name: "value", type: "float" }, "in", "n1", floatOut),
    ).not.toBe("origin");
  });

  it("idle for a same-side port even when node/handle differ (not a candidate)", () => {
    expect(
      portDragMode({ name: "other", type: "float" }, "out", "n3", floatOut),
    ).toBe("idle");
  });

  it("compat for an opposite-side port with a matching type", () => {
    expect(
      portDragMode({ name: "in", type: "float" }, "in", "n4", floatOut),
    ).toBe("compat");
  });

  it("incompat for an opposite-side port with a mismatched type", () => {
    expect(
      portDragMode({ name: "in", type: "vec3" }, "in", "n4", floatOut),
    ).toBe("incompat");
  });

  it("compat/incompat resolve correctly even with nodeId null (outside a Handle context)", () => {
    expect(
      portDragMode({ name: "in", type: "float" }, "in", null, floatOut),
    ).toBe("compat");
    expect(
      portDragMode({ name: "in", type: "vec3" }, "in", null, floatOut),
    ).toBe("incompat");
  });
});

describe("snapSeqFor", () => {
  const snap: SnapPulse = { nodeId: "n1", handleId: "value", seq: 3 };

  it("returns 0 when there is no snap", () => {
    expect(snapSeqFor(null, "n1", "value", "in")).toBe(0);
  });

  it("returns 0 for an output port even if node/handle match (snap only fires on inputs)", () => {
    expect(snapSeqFor(snap, "n1", "value", "out")).toBe(0);
  });

  it("returns 0 when nodeId does not match", () => {
    expect(snapSeqFor(snap, "n2", "value", "in")).toBe(0);
  });

  it("returns 0 when handleId (port name) does not match", () => {
    expect(snapSeqFor(snap, "n1", "other", "in")).toBe(0);
  });

  it("returns the snap's seq when node/handle/side all match", () => {
    expect(snapSeqFor(snap, "n1", "value", "in")).toBe(3);
  });

  it("returns 0 when nodeId is null (outside a Handle context)", () => {
    expect(snapSeqFor(snap, null, "value", "in")).toBe(0);
  });
});

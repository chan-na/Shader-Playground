import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionDragSource } from "./connectionUiStore";
import { useConnectionUiStore } from "./connectionUiStore";

describe("connectionUiStore", () => {
  afterEach(() => {
    useConnectionUiStore.setState({ dragging: null, snap: null });
  });

  it("starts with dragging and snap both null", () => {
    const s = useConnectionUiStore.getState();
    expect(s.dragging).toBeNull();
    expect(s.snap).toBeNull();
  });

  it("startDrag sets dragging, endDrag clears it back to null", () => {
    const source: ConnectionDragSource = {
      nodeId: "n1",
      handleId: "out",
      side: "out",
      portType: "float",
    };
    useConnectionUiStore.getState().startDrag(source);
    expect(useConnectionUiStore.getState().dragging).toEqual(source);

    useConnectionUiStore.getState().endDrag();
    expect(useConnectionUiStore.getState().dragging).toBeNull();
  });

  it("triggerSnap increments seq monotonically from 1, even on the same port", () => {
    useConnectionUiStore.getState().triggerSnap("n2", "in");
    expect(useConnectionUiStore.getState().snap).toEqual({
      nodeId: "n2",
      handleId: "in",
      seq: 1,
    });

    useConnectionUiStore.getState().triggerSnap("n2", "in");
    expect(useConnectionUiStore.getState().snap).toEqual({
      nodeId: "n2",
      handleId: "in",
      seq: 2,
    });
  });

  it("clearSnap resets snap to null", () => {
    useConnectionUiStore.getState().triggerSnap("n3", "in");
    expect(useConnectionUiStore.getState().snap).not.toBeNull();

    useConnectionUiStore.getState().clearSnap();
    expect(useConnectionUiStore.getState().snap).toBeNull();
  });

  it("startDrag/endDrag do not touch snap", () => {
    useConnectionUiStore.getState().triggerSnap("n4", "in");
    const snapBefore = useConnectionUiStore.getState().snap;

    const source: ConnectionDragSource = {
      nodeId: "n5",
      handleId: "out",
      side: "out",
      portType: "vec3",
    };
    useConnectionUiStore.getState().startDrag(source);
    expect(useConnectionUiStore.getState().snap).toEqual(snapBefore);

    useConnectionUiStore.getState().endDrag();
    expect(useConnectionUiStore.getState().snap).toEqual(snapBefore);
  });
});

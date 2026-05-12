import { beforeEach, describe, expect, it } from "vitest";
import { defaultCameraState } from "../core/camera/orbitCamera";
import { useCameraStore } from "./cameraStore";

describe("cameraStore", () => {
  beforeEach(() => {
    useCameraStore.getState().reset();
  });

  it("starts with the default camera state and rev=0 after reset", () => {
    expect(useCameraStore.getState().camera).toEqual(defaultCameraState());
  });

  it("setCamera bumps rev so the RAF loop wakes from idle", () => {
    const before = useCameraStore.getState().rev;
    useCameraStore.getState().setCamera({
      ...defaultCameraState(),
      yaw: 1.234,
    });
    const after = useCameraStore.getState();
    expect(after.camera.yaw).toBeCloseTo(1.234);
    expect(after.rev).toBe(before + 1);
  });

  it("reset bumps rev so the static viewport repaints the default pose", () => {
    useCameraStore.getState().setCamera({
      ...defaultCameraState(),
      distance: 8,
    });
    const before = useCameraStore.getState().rev;
    useCameraStore.getState().reset();
    expect(useCameraStore.getState().rev).toBe(before + 1);
    expect(useCameraStore.getState().camera).toEqual(defaultCameraState());
  });
});

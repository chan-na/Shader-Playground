import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultCameraState,
  type OrbitCameraState,
} from "../core/camera/orbitCamera";
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

  // The Viewport GL boot effect mirrors external camera writes back into the
  // CameraController through exactly this call shape (#6). zustand 5 dropped
  // the `subscribe(selector, listener)` overload, so a two-argument call would
  // silently treat the selector as the listener and never deliver the state.
  it("subscribe delivers the whole state to a single listener argument", () => {
    const seen: OrbitCameraState[] = [];
    const unsubscribe = useCameraStore.subscribe((s) => {
      seen.push(s.camera);
    });
    useCameraStore.getState().setCamera({ ...defaultCameraState(), yaw: 0.5 });
    useCameraStore.getState().reset();
    unsubscribe();
    // Post-unsubscribe writes must not be observed — the Viewport effect
    // cleanup relies on this to avoid writing into a detached controller.
    useCameraStore.getState().setCamera({ ...defaultCameraState(), yaw: 1.5 });

    expect(seen.length).toBe(2);
    expect(seen[0]?.yaw).toBeCloseTo(0.5);
    expect(seen[1]).toEqual(defaultCameraState());
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

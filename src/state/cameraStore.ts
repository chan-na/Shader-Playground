import { create } from "zustand";
import {
  defaultCameraState,
  type OrbitCameraState,
} from "../core/camera/orbitCamera";

export interface CameraStoreState {
  camera: OrbitCameraState;
  /** Bumped on every camera mutation; RAF loop reads this to detect idle. */
  rev: number;
  setCamera: (c: OrbitCameraState) => void;
  reset: () => void;
}

export const useCameraStore = create<CameraStoreState>((set) => ({
  camera: defaultCameraState(),
  rev: 0,
  setCamera: (c) => set((s) => ({ camera: c, rev: s.rev + 1 })),
  reset: () => set((s) => ({ camera: defaultCameraState(), rev: s.rev + 1 })),
}));

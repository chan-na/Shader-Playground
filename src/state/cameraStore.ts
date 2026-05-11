import { create } from "zustand";
import {
  defaultCameraState,
  type OrbitCameraState,
} from "../core/camera/orbitCamera";

export interface CameraStoreState {
  camera: OrbitCameraState;
  setCamera: (c: OrbitCameraState) => void;
  reset: () => void;
}

export const useCameraStore = create<CameraStoreState>((set) => ({
  camera: defaultCameraState(),
  setCamera: (c) => set({ camera: c }),
  reset: () => set({ camera: defaultCameraState() }),
}));

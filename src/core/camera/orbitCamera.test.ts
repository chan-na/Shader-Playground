import { describe, expect, it } from "vitest";
import {
  cameraEye,
  clampCamera,
  defaultCameraState,
  modelMatrix,
  orbit,
  pan,
  projMatrix,
  viewMatrix,
  zoom,
} from "./orbitCamera";

describe("orbitCamera", () => {
  it("default state is sane", () => {
    const c = defaultCameraState();
    expect(c.distance).toBeGreaterThan(0);
    expect(c.fov).toBeGreaterThan(0);
  });

  it("cameraEye matches yaw/pitch/distance trig", () => {
    const c = {
      ...defaultCameraState(),
      yaw: 0,
      pitch: 0,
      distance: 5,
      target: [0, 0, 0] as [number, number, number],
    };
    const eye = cameraEye(c);
    expect(eye[0]).toBeCloseTo(0, 5);
    expect(eye[1]).toBeCloseTo(0, 5);
    expect(eye[2]).toBeCloseTo(5, 5);
  });

  it("orbit changes yaw/pitch in expected direction", () => {
    const c = defaultCameraState();
    const after = orbit(c, 100, 0, 0.01);
    expect(after.yaw).toBeLessThan(c.yaw);
  });

  it("zoom respects min/max bounds", () => {
    const c = {
      ...defaultCameraState(),
      distance: 1,
      minDistance: 1,
      maxDistance: 10,
    };
    const out = zoom(c, -100000); // huge negative, would shrink
    expect(out.distance).toBeGreaterThanOrEqual(c.minDistance);
    const big = zoom(c, 100000);
    expect(big.distance).toBeLessThanOrEqual(c.maxDistance);
  });

  it("pan moves the target", () => {
    const c = defaultCameraState();
    const after = pan(c, 50, 0, 0.01);
    const moved =
      after.target[0] !== c.target[0] ||
      after.target[1] !== c.target[1] ||
      after.target[2] !== c.target[2];
    expect(moved).toBe(true);
  });

  it("clampCamera clamps pitch to [-pi/2 + eps, pi/2 - eps]", () => {
    const c = { ...defaultCameraState(), pitch: 999 };
    const clamped = clampCamera(c);
    expect(Math.abs(clamped.pitch)).toBeLessThan(Math.PI / 2);
  });

  it("clampCamera clamps distance to [minDistance, maxDistance]", () => {
    const tooClose = clampCamera({
      ...defaultCameraState(),
      distance: 0.001,
    });
    expect(tooClose.distance).toBe(tooClose.minDistance);
    const tooFar = clampCamera({ ...defaultCameraState(), distance: 1e6 });
    expect(tooFar.distance).toBe(tooFar.maxDistance);
  });

  it("pan with non-zero dy moves the y component of target", () => {
    const c = { ...defaultCameraState(), pitch: 0, yaw: 0 };
    const after = pan(c, 0, 100, 0.01);
    // With pitch=0 the up vector is (0, 1, 0), so dy>0 shifts target[1] up.
    expect(after.target[1]).toBeGreaterThan(c.target[1]);
  });

  it("viewMatrix writes a 16-element mat4 (lookAt)", () => {
    const c = defaultCameraState();
    const m = viewMatrix(c);
    expect(m.length).toBe(16);
    // Identity check would fail for lookAt; just ensure it produced finite numbers.
    for (const v of m) expect(Number.isFinite(v)).toBe(true);
  });

  it("viewMatrix reuses the provided out matrix", () => {
    const c = defaultCameraState();
    const out = new Float32Array(16);
    const m = viewMatrix(c, out as unknown as Float32Array);
    expect(m).toBe(out);
  });

  it("projMatrix writes a finite perspective mat4", () => {
    const c = defaultCameraState();
    const m = projMatrix(c, 16 / 9);
    expect(m.length).toBe(16);
    for (const v of m) expect(Number.isFinite(v)).toBe(true);
  });

  it("projMatrix reuses the provided out matrix", () => {
    const out = new Float32Array(16);
    const m = projMatrix(
      defaultCameraState(),
      1.5,
      out as unknown as Float32Array,
    );
    expect(m).toBe(out);
  });

  it("modelMatrix returns identity", () => {
    const m = modelMatrix();
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
  });

  it("modelMatrix reuses the provided out matrix", () => {
    const out = new Float32Array(16);
    const m = modelMatrix(out as unknown as Float32Array);
    expect(m).toBe(out);
  });

  it("clamps extreme zoom/orbit so viewMatrix never degenerates (L40)", () => {
    const c = defaultCameraState();
    // Zoom far past both limits — distance must stay within [min, max] so eye
    // never collapses onto target (a zero forward vector → NaN lookAt).
    const zoomedIn = zoom(clampCamera({ ...c, distance: -1000 }), -1e6);
    const zoomedOut = zoom(clampCamera({ ...c, distance: 1e9 }), 1e6);
    expect(zoomedIn.distance).toBeGreaterThanOrEqual(c.minDistance);
    expect(zoomedOut.distance).toBeLessThanOrEqual(c.maxDistance);
    // Orbit past vertical — pitch clamps short of ±π/2 so up stays non-parallel.
    const tiltedUp = orbit(c, 0, 1e6);
    const tiltedDown = orbit(c, 0, -1e6);
    expect(tiltedUp.pitch).toBeLessThanOrEqual(c.maxPitch);
    expect(tiltedDown.pitch).toBeGreaterThanOrEqual(c.minPitch);
    for (const s of [zoomedIn, zoomedOut, tiltedUp, tiltedDown]) {
      for (const v of viewMatrix(s)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

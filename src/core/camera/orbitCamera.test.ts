import { describe, expect, it } from 'vitest';
import {
  cameraEye,
  clampCamera,
  defaultCameraState,
  orbit,
  pan,
  zoom,
} from './orbitCamera';

describe('orbitCamera', () => {
  it('default state is sane', () => {
    const c = defaultCameraState();
    expect(c.distance).toBeGreaterThan(0);
    expect(c.fov).toBeGreaterThan(0);
  });

  it('cameraEye matches yaw/pitch/distance trig', () => {
    const c = { ...defaultCameraState(), yaw: 0, pitch: 0, distance: 5, target: [0, 0, 0] as [number, number, number] };
    const eye = cameraEye(c);
    expect(eye[0]).toBeCloseTo(0, 5);
    expect(eye[1]).toBeCloseTo(0, 5);
    expect(eye[2]).toBeCloseTo(5, 5);
  });

  it('orbit changes yaw/pitch in expected direction', () => {
    const c = defaultCameraState();
    const after = orbit(c, 100, 0, 0.01);
    expect(after.yaw).toBeLessThan(c.yaw);
  });

  it('zoom respects min/max bounds', () => {
    const c = { ...defaultCameraState(), distance: 1, minDistance: 1, maxDistance: 10 };
    const out = zoom(c, -100000); // huge negative, would shrink
    expect(out.distance).toBeGreaterThanOrEqual(c.minDistance);
    const big = zoom(c, 100000);
    expect(big.distance).toBeLessThanOrEqual(c.maxDistance);
  });

  it('pan moves the target', () => {
    const c = defaultCameraState();
    const after = pan(c, 50, 0, 0.01);
    const moved =
      after.target[0] !== c.target[0] ||
      after.target[1] !== c.target[1] ||
      after.target[2] !== c.target[2];
    expect(moved).toBe(true);
  });

  it('clampCamera clamps pitch to [-pi/2 + eps, pi/2 - eps]', () => {
    const c = { ...defaultCameraState(), pitch: 999 };
    const clamped = clampCamera(c);
    expect(Math.abs(clamped.pitch)).toBeLessThan(Math.PI / 2);
  });
});

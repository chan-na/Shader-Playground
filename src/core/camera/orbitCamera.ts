import { mat4, type vec3 } from "gl-matrix";

export interface OrbitCameraState {
  target: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  minPitch: number;
  maxPitch: number;
}

export function defaultCameraState(): OrbitCameraState {
  return {
    target: [0, 0, 0],
    distance: 4,
    yaw: Math.PI * 0.25,
    pitch: Math.PI * 0.15,
    fov: Math.PI / 4,
    near: 0.05,
    far: 100,
    minDistance: 0.5,
    maxDistance: 50,
    minPitch: -Math.PI * 0.49,
    maxPitch: Math.PI * 0.49,
  };
}

export function clampCamera(c: OrbitCameraState): OrbitCameraState {
  return {
    ...c,
    distance: Math.min(c.maxDistance, Math.max(c.minDistance, c.distance)),
    pitch: Math.min(c.maxPitch, Math.max(c.minPitch, c.pitch)),
  };
}

export function cameraEye(c: OrbitCameraState): [number, number, number] {
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  return [
    c.target[0] + c.distance * cp * sy,
    c.target[1] + c.distance * sp,
    c.target[2] + c.distance * cp * cy,
  ];
}

export function viewMatrix(c: OrbitCameraState, out?: mat4): mat4 {
  const m = out ?? mat4.create();
  const eye = cameraEye(c);
  mat4.lookAt(m, eye as vec3, c.target as vec3, [0, 1, 0]);
  return m;
}

export function projMatrix(
  c: OrbitCameraState,
  aspect: number,
  out?: mat4,
): mat4 {
  const m = out ?? mat4.create();
  mat4.perspective(m, c.fov, aspect, c.near, c.far);
  return m;
}

export function modelMatrix(out?: mat4): mat4 {
  const m = out ?? mat4.create();
  mat4.identity(m);
  return m;
}

export function orbit(
  c: OrbitCameraState,
  dx: number,
  dy: number,
  speed = 0.005,
): OrbitCameraState {
  return clampCamera({
    ...c,
    yaw: c.yaw - dx * speed,
    pitch: c.pitch + dy * speed,
  });
}

export function pan(
  c: OrbitCameraState,
  dx: number,
  dy: number,
  speed = 0.003,
): OrbitCameraState {
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  // right vector in world
  const rx = cy;
  const rz = -sy;
  // up vector relative to camera
  const ux = -sy * sp;
  const uy = cp;
  const uz = -cy * sp;
  const k = c.distance * speed;
  return {
    ...c,
    target: [
      c.target[0] - dx * k * rx + dy * k * ux,
      c.target[1] + dy * k * uy,
      c.target[2] - dx * k * rz + dy * k * uz,
    ],
  };
}

export function zoom(
  c: OrbitCameraState,
  delta: number,
  speed = 0.0015,
): OrbitCameraState {
  return clampCamera({
    ...c,
    distance: c.distance * (1 + delta * speed),
  });
}

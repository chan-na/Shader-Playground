import {
  defaultCameraState,
  type OrbitCameraState,
  orbit,
  pan,
  zoom,
} from "./orbitCamera";

/** Approx pixels per wheel "line" / "page" for deltaMode normalisation. */
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 800;

export interface CameraController {
  state: OrbitCameraState;
  attach(canvas: HTMLCanvasElement): void;
  detach(): void;
  reset(): void;
  setOnChange(cb: (s: OrbitCameraState) => void): void;
}

export function createCameraController(
  initial?: Partial<OrbitCameraState>,
): CameraController {
  let state: OrbitCameraState = { ...defaultCameraState(), ...initial };
  let canvas: HTMLCanvasElement | null = null;
  let onChange: ((s: OrbitCameraState) => void) | null = null;
  let dragMode: "orbit" | "pan" | null = null;
  let lastX = 0;
  let lastY = 0;

  const notify = () => {
    if (onChange) onChange(state);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!canvas) return;
    if (e.button === 0) dragMode = "orbit";
    else if (e.button === 2) dragMode = "pan";
    else return;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragMode) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dragMode === "orbit") state = orbit(state, dx, dy);
    else state = pan(state, dx, dy);
    notify();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragMode) return;
    dragMode = null;
    if (canvas?.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: WheelEvent) => {
    // Normalise the wheel delta to pixels. Firefox reports line (deltaMode 1)
    // or page (deltaMode 2) units with tiny magnitudes (≈3 per notch), so
    // passing the raw deltaY makes zoom ~30× weaker there than Chrome's pixels.
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= WHEEL_LINE_PX;
    else if (e.deltaMode === 2)
      delta *= canvas ? canvas.clientHeight || WHEEL_PAGE_PX : WHEEL_PAGE_PX;
    state = zoom(state, delta);
    notify();
    e.preventDefault();
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  return {
    get state() {
      return state;
    },
    set state(s: OrbitCameraState) {
      state = s;
    },
    attach(c: HTMLCanvasElement) {
      canvas = c;
      c.addEventListener("pointerdown", onPointerDown);
      c.addEventListener("pointermove", onPointerMove);
      c.addEventListener("pointerup", onPointerUp);
      c.addEventListener("pointercancel", onPointerUp);
      c.addEventListener("wheel", onWheel, { passive: false });
      c.addEventListener("contextmenu", onContextMenu);
    },
    detach() {
      if (!canvas) return;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas = null;
    },
    reset() {
      state = { ...defaultCameraState(), ...initial };
      notify();
    },
    setOnChange(cb) {
      onChange = cb;
    },
  };
}

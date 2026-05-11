import {
  defaultCameraState,
  orbit,
  pan,
  zoom,
  type OrbitCameraState,
} from './orbitCamera';

export interface CameraController {
  state: OrbitCameraState;
  attach(canvas: HTMLCanvasElement): void;
  detach(): void;
  reset(): void;
  setOnChange(cb: (s: OrbitCameraState) => void): void;
}

export function createCameraController(initial?: Partial<OrbitCameraState>): CameraController {
  let state: OrbitCameraState = { ...defaultCameraState(), ...initial };
  let canvas: HTMLCanvasElement | null = null;
  let onChange: ((s: OrbitCameraState) => void) | null = null;
  let dragMode: 'orbit' | 'pan' | null = null;
  let lastX = 0;
  let lastY = 0;

  const notify = () => {
    if (onChange) onChange(state);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!canvas) return;
    if (e.button === 0) dragMode = 'orbit';
    else if (e.button === 2) dragMode = 'pan';
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
    if (dragMode === 'orbit') state = orbit(state, dx, dy);
    else state = pan(state, dx, dy);
    notify();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragMode) return;
    dragMode = null;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: WheelEvent) => {
    state = zoom(state, e.deltaY);
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
      c.addEventListener('pointerdown', onPointerDown);
      c.addEventListener('pointermove', onPointerMove);
      c.addEventListener('pointerup', onPointerUp);
      c.addEventListener('pointercancel', onPointerUp);
      c.addEventListener('wheel', onWheel, { passive: false });
      c.addEventListener('contextmenu', onContextMenu);
    },
    detach() {
      if (!canvas) return;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
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

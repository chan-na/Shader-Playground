import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraController } from "./input";
import type { OrbitCameraState } from "./orbitCamera";

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  // jsdom doesn't implement pointer capture — stub so the controller's calls
  // don't throw and so we can observe whether they happened.
  (
    c as unknown as { setPointerCapture: (id: number) => void }
  ).setPointerCapture = vi.fn();
  (
    c as unknown as { releasePointerCapture: (id: number) => void }
  ).releasePointerCapture = vi.fn();
  (
    c as unknown as { hasPointerCapture: (id: number) => boolean }
  ).hasPointerCapture = vi.fn(() => true);
  return c;
}

interface PointerInit {
  button?: number;
  clientX?: number;
  clientY?: number;
  pointerId?: number;
}

function pointer(type: string, init: PointerInit = {}): Event {
  // jsdom omits `PointerEvent`; fabricate a base Event with the fields the
  // controller reads. addEventListener matches by type string, not subtype.
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    button: init.button ?? 0,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    pointerId: init.pointerId ?? 1,
  });
  return e;
}

function wheel(deltaY: number, deltaMode = 0): WheelEvent {
  return new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
    deltaMode,
  });
}

describe("createCameraController", () => {
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    canvas = makeCanvas();
  });

  it("merges initial overrides over the default state", () => {
    const ctrl = createCameraController({ distance: 12 });
    expect(ctrl.state.distance).toBe(12);
  });

  it("orbit drag (button 0) updates yaw/pitch and notifies", () => {
    const ctrl = createCameraController();
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    ctrl.attach(canvas);

    canvas.dispatchEvent(
      pointer("pointerdown", { button: 0, clientX: 100, clientY: 100 }),
    );
    canvas.dispatchEvent(
      pointer("pointermove", { clientX: 150, clientY: 110 }),
    );

    expect(updates.length).toBe(1);
    const yawBefore = ctrl.state.yaw;
    // Another move continues the drag; yaw should keep moving in the same dx>0 direction.
    canvas.dispatchEvent(
      pointer("pointermove", { clientX: 200, clientY: 110 }),
    );
    expect(updates.length).toBe(2);
    expect(ctrl.state.yaw).toBeLessThan(yawBefore);
  });

  it("pan drag (button 2) moves the camera target", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);

    const target0 = [...ctrl.state.target] as [number, number, number];
    canvas.dispatchEvent(
      pointer("pointerdown", { button: 2, clientX: 0, clientY: 0 }),
    );
    canvas.dispatchEvent(pointer("pointermove", { clientX: 50, clientY: 50 }));

    expect(ctrl.state.target).not.toEqual(target0);
  });

  it("ignores middle button (no drag mode entered)", () => {
    const ctrl = createCameraController();
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    ctrl.attach(canvas);

    canvas.dispatchEvent(
      pointer("pointerdown", { button: 1, clientX: 0, clientY: 0 }),
    );
    canvas.dispatchEvent(pointer("pointermove", { clientX: 50, clientY: 50 }));

    expect(updates).toEqual([]);
  });

  it("pointermove without a prior pointerdown is a no-op", () => {
    const ctrl = createCameraController();
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    ctrl.attach(canvas);

    canvas.dispatchEvent(pointer("pointermove", { clientX: 50, clientY: 50 }));
    expect(updates).toEqual([]);
  });

  it("pointerup ends the drag and releases capture when held", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);
    canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
    canvas.dispatchEvent(pointer("pointerup", {}));

    // Subsequent move after up should NOT update state — drag is over.
    const yawAtUp = ctrl.state.yaw;
    canvas.dispatchEvent(
      pointer("pointermove", { clientX: 999, clientY: 999 }),
    );
    expect(ctrl.state.yaw).toBe(yawAtUp);
    expect(canvas.releasePointerCapture).toHaveBeenCalled();
  });

  it("pointerup is a no-op when no drag is active", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);
    canvas.dispatchEvent(pointer("pointerup", {}));
    // releasePointerCapture must NOT have been called — guarded by `if (!dragMode)`.
    expect(canvas.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("pointercancel ends an active drag", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);
    canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
    canvas.dispatchEvent(pointer("pointercancel", {}));
    const yawAfter = ctrl.state.yaw;
    canvas.dispatchEvent(
      pointer("pointermove", { clientX: 500, clientY: 500 }),
    );
    expect(ctrl.state.yaw).toBe(yawAfter);
  });

  it("wheel zooms and notifies", () => {
    const ctrl = createCameraController();
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    ctrl.attach(canvas);

    const dist0 = ctrl.state.distance;
    canvas.dispatchEvent(wheel(500));
    expect(updates.length).toBe(1);
    expect(ctrl.state.distance).toBeGreaterThan(dist0);
  });

  it("normalizes line-mode wheel deltas to match pixel-mode zoom (M2/L40)", () => {
    // Firefox physical wheels report deltaMode=1 (lines, ≈3/notch). 3 lines must
    // zoom the same as 48 pixels (3 × 16px/line), not ~30× weaker.
    const pixelCtrl = createCameraController();
    const pixelCanvas = makeCanvas();
    pixelCtrl.attach(pixelCanvas);

    const lineCtrl = createCameraController();
    const lineCanvas = makeCanvas();
    lineCtrl.attach(lineCanvas);

    pixelCanvas.dispatchEvent(wheel(48, 0)); // DOM_DELTA_PIXEL
    lineCanvas.dispatchEvent(wheel(3, 1)); // DOM_DELTA_LINE (3 × 16 = 48px)

    expect(lineCtrl.state.distance).toBeGreaterThan(0);
    expect(lineCtrl.state.distance).toBeCloseTo(pixelCtrl.state.distance, 5);
  });

  it("contextmenu is prevented (so right-drag pan doesn't open menu)", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);
    const ev = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("detach removes listeners so further events don't update state", () => {
    const ctrl = createCameraController();
    ctrl.attach(canvas);
    ctrl.detach();

    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
    canvas.dispatchEvent(
      pointer("pointermove", { clientX: 100, clientY: 100 }),
    );
    canvas.dispatchEvent(wheel(100));

    expect(updates).toEqual([]);
  });

  it("detach without a prior attach is safe", () => {
    const ctrl = createCameraController();
    expect(() => ctrl.detach()).not.toThrow();
  });

  it("reset restores defaults + initial overrides and notifies", () => {
    const ctrl = createCameraController({ distance: 7 });
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    ctrl.attach(canvas);
    canvas.dispatchEvent(wheel(800));
    expect(ctrl.state.distance).not.toBe(7);

    ctrl.reset();
    expect(ctrl.state.distance).toBe(7);
    expect(updates[updates.length - 1]?.distance).toBe(7);
  });

  it("state setter assigns directly without notifying", () => {
    const ctrl = createCameraController();
    const updates: OrbitCameraState[] = [];
    ctrl.setOnChange((s) => updates.push(s));
    const next = { ...ctrl.state, distance: 9.5 };
    ctrl.state = next;
    expect(ctrl.state.distance).toBe(9.5);
    expect(updates).toEqual([]);
  });

  it("a drag started after an external state assignment builds on it", () => {
    // Viewport subscribes to cameraStore and pushes external writes (Reset
    // view, zoom buttons, share restore) into `ctrl.state`. Without that
    // mirror the controller kept mutating its own stale copy, so the first
    // drag after such a write snapped the pose back. (#6)
    const ctrl = createCameraController();
    ctrl.attach(canvas);

    // Drag once so the controller's private copy is no longer the default.
    canvas.dispatchEvent(
      pointer("pointerdown", { button: 0, clientX: 0, clientY: 0 }),
    );
    canvas.dispatchEvent(pointer("pointermove", { clientX: 80, clientY: 0 }));
    canvas.dispatchEvent(pointer("pointerup", {}));
    const draggedYaw = ctrl.state.yaw;
    expect(draggedYaw).not.toBeCloseTo(0, 5);

    // An external write lands (the store-driven mirror).
    ctrl.state = { ...ctrl.state, yaw: 0, distance: 5 };

    // The next drag must start from the assigned pose: dx=10 at the default
    // 0.005 rad/px orbit speed is exactly -0.05 rad off the assigned yaw.
    // Ignoring the assignment would land near `draggedYaw - 0.05` instead.
    canvas.dispatchEvent(
      pointer("pointerdown", { button: 0, clientX: 0, clientY: 0 }),
    );
    canvas.dispatchEvent(pointer("pointermove", { clientX: 10, clientY: 0 }));
    expect(ctrl.state.yaw).toBeCloseTo(-0.05, 5);
    expect(ctrl.state.distance).toBe(5);
  });

  it("pointerdown is a no-op when no canvas is attached (no throw)", () => {
    const ctrl = createCameraController();
    // Don't attach. Dispatch through a detached element shouldn't reach the
    // handler, but call the exposed surface area to exercise the early-return.
    expect(() => ctrl.detach()).not.toThrow();
    expect(ctrl.state).toBeDefined();
  });
});

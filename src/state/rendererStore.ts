import { create } from "zustand";
import { log } from "../utils/log";

// Cap retained render errors — unbounded accumulation was a memory leak.
const RENDERER_ERROR_CAP = 50;

interface RendererStats {
  fps: number;
  frame: number;
  drawCalls: number;
  /**
   * Monotonic counter incremented each time the RAF loop actually calls
   * `executePlan`. Idle frames (static graph guard, see Viewport) do NOT bump
   * it. Surfaces "is the loop doing GPU work?" without depending on the
   * 500 ms FPS window.
   */
  renderTick: number;
  errors: string[];
}

/** One-time GL adapter identity, captured at context creation for bug reports. */
export interface GlInfo {
  renderer: string;
  version: string;
}

/**
 * One drawable composite cell: an Output node paired with the shader-pass
 * node whose FBO it composites. Mirrors the `drawable` filter in
 * execute.ts's composite step so pane order matches the composite cell
 * order 1:1. Not exported — consumers read it structurally through
 * `RendererState.panes`.
 */
interface ViewportPane {
  outputNodeId: string;
  sourceNodeId: string;
}

export interface RendererState {
  ready: boolean;
  stats: RendererStats;
  glInfo: GlInfo | null;
  /** Drawable Output panes for the current compiled plan, in composite order. */
  panes: ViewportPane[];
  /** Canvas backing (device-pixel) resolution, as last set by the RAF resize step. */
  canvasSize: { width: number; height: number };
  /**
   * True when the Viewport's GL boot effect failed to obtain a WebGL2
   * context (createGLContext threw). Drives the full-app GpuBlockScreen
   * scrim (design/System States.dc.html gpu-unsupported, M7-U5).
   */
  contextUnavailable: boolean;
  /**
   * Bumped by retryGlContext() to force Viewport's GL boot useEffect to
   * re-run (it's in the effect's deps array) — the only way to retry
   * createGLContext, since the effect otherwise only runs once on mount.
   */
  glRetryTick: number;
  /**
   * One-shot "save the next drawn frame as a PNG" request. Set by the toolbar
   * and served by the Viewport RAF loop, which is the only place that can read
   * the drawing buffer while it is still valid (the context is created with
   * `preserveDrawingBuffer: false`). Also feeds the idle gate so a paused,
   * static graph still draws the frame the snapshot needs. (#3)
   */
  snapshotRequested: boolean;
  setReady: (ready: boolean) => void;
  setStats: (stats: Partial<RendererStats>) => void;
  setGlInfo: (info: GlInfo) => void;
  bumpRenderTick: () => void;
  pushError: (msg: string) => void;
  clearErrors: () => void;
  setPanes: (panes: ViewportPane[]) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setContextUnavailable: (v: boolean) => void;
  /** User-triggered retry from GpuBlockScreen: re-arm the boot effect and
   *  optimistically clear the blocking screen (the effect re-sets it to
   *  true again if createGLContext still fails). */
  retryGlContext: () => void;
  /**
   * Ask the render loop to save the next drawn frame as a PNG. Idempotent while
   * a request is already pending — repeated clicks yield one file.
   *
   * Returns whether the request was accepted. It is **refused** when `ready` is
   * false, because this flag has exactly one server (the Viewport RAF loop) and
   * arming it with no loop running would leave it set until the *next* Viewport
   * mount, which then downloads a PNG nobody asked for. Callers should surface
   * the refusal; silently dropping it is what the flag's one-shot contract is
   * there to prevent. (F1)
   *
   * ⚠ `ready` only means "the loop is alive", not "the canvas is visible". A
   * Viewport inside a collapsed rail or behind a maximised sibling is
   * `display:none` with `ready === true`, and the capture then reads a clamped
   * 1×1 buffer. That is a separate gap (§4 F21), deliberately not papered over
   * here.
   */
  requestSnapshot: () => boolean;
  /**
   * Read-and-clear the pending snapshot request. Returns `true` exactly once
   * per {@link requestSnapshot}, so the frame loop can branch on it directly
   * without a separate reset call.
   */
  consumeSnapshotRequest: () => boolean;
}

function panesEqual(a: ViewportPane[], b: ViewportPane[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (!pa || !pb) return false;
    if (pa.outputNodeId !== pb.outputNodeId) return false;
    if (pa.sourceNodeId !== pb.sourceNodeId) return false;
  }
  return true;
}

export const useRendererStore = create<RendererState>((set, get) => ({
  ready: false,
  stats: { fps: 0, frame: 0, drawCalls: 0, renderTick: 0, errors: [] },
  glInfo: null,
  panes: [],
  canvasSize: { width: 1, height: 1 },
  contextUnavailable: false,
  glRetryTick: 0,
  snapshotRequested: false,
  setReady: (ready) => set({ ready }),
  setGlInfo: (glInfo) => set({ glInfo }),
  setStats: (patch) => set((s) => ({ stats: { ...s.stats, ...patch } })),
  bumpRenderTick: () =>
    set((s) => ({
      stats: { ...s.stats, renderTick: s.stats.renderTick + 1 },
    })),
  pushError: (msg) => {
    log.error("render", msg);
    set((s) => ({
      stats: {
        ...s.stats,
        errors: [...s.stats.errors, msg].slice(-RENDERER_ERROR_CAP),
      },
    }));
  },
  clearErrors: () => set((s) => ({ stats: { ...s.stats, errors: [] } })),
  setPanes: (panes) => {
    // No-op guard: recompile() calls this every recompile (potentially every
    // frame while the graph is being edited), so bail out without touching
    // state — and without a new array reference — when nothing changed.
    if (panesEqual(get().panes, panes)) return;
    set({ panes });
  },
  setCanvasSize: (size) => {
    const cur = get().canvasSize;
    if (cur.width === size.width && cur.height === size.height) return;
    set({ canvasSize: size });
  },
  setContextUnavailable: (v) => set({ contextUnavailable: v }),
  retryGlContext: () =>
    set((s) => ({ glRetryTick: s.glRetryTick + 1, contextUnavailable: false })),
  requestSnapshot: () => {
    // No render loop, no server: refuse rather than arm a flag that would fire
    // on the first frame after the next Viewport mount. See the interface doc.
    if (!get().ready) return false;
    if (get().snapshotRequested) return true;
    set({ snapshotRequested: true });
    return true;
  },
  consumeSnapshotRequest: () => {
    if (!get().snapshotRequested) return false;
    set({ snapshotRequested: false });
    return true;
  },
}));

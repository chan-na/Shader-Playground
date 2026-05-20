import { useEffect, useRef } from "react";
import { createCameraController } from "../../core/camera/input";
import {
  disposeAllExternal,
  updateExternalSources,
} from "../../core/external/registry";
import { createGLContext } from "../../core/gl/context";
import { GpuTimerPool } from "../../core/gl/gpuTimer";
import {
  compileGraph,
  type ExecutionPlan,
  emptyPlan,
} from "../../core/graph/compile";
import { parseShaderInfoLog } from "../../core/graph/diagnostics";
import { executePlan } from "../../core/graph/execute";
import { AsyncThumbnailReadback } from "../../core/thumbnail/asyncReadback";
import { snapshotAssets, useAssetStore } from "../../state/assetStore";
import { useCameraStore } from "../../state/cameraStore";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../state/diagnosticsStore";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { snapshotGraph, useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { thumbnailScheduler } from "../../state/thumbnailScheduler";
import { useTimeStore } from "../../state/timeStore";
import { useViewportStore } from "../../state/viewportStore";

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setReady = useRendererStore((s) => s.setReady);
  const setStats = useRendererStore((s) => s.setStats);
  const bumpRenderTick = useRendererStore((s) => s.bumpRenderTick);
  const pushError = useRendererStore((s) => s.pushError);
  const clearErrors = useRendererStore((s) => s.clearErrors);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext;
    try {
      gl = createGLContext(canvas);
    } catch (e) {
      pushError(String(e));
      return;
    }

    const cameraCtl = createCameraController(useCameraStore.getState().camera);
    cameraCtl.setOnChange((c) => useCameraStore.getState().setCamera(c));
    cameraCtl.attach(canvas);

    let plan: ExecutionPlan = emptyPlan(canvas.width || 1, canvas.height || 1);
    const asyncReadback = new AsyncThumbnailReadback();
    // GPU timer is optional — the extension is Chrome-only. When absent the
    // pool is null and the executePlan wrapping is a no-op via optional chain.
    let gpuTimer: GpuTimerPool | null = GpuTimerPool.create(gl);
    useGpuTimerStore.getState().setSupported(gpuTimer !== null);
    let lastPassNodeIds = new Set<string>();
    let lastRev = -1;
    let lastAssetRev = -1;
    let lastUniformRev = -1;
    let lastCameraRev = -1;
    let lastTimeRev = -1;
    let lastViewportRev = -1;
    let alive = true;
    let rafId = 0;
    let prev = performance.now();
    let frameCount = 0;
    let fpsAccum = 0;
    let contextLost = false;
    const CONTEXT_LOST_MSG = "GPU 컨텍스트 손실 — 복구 중…";
    const timeStore = useTimeStore;

    const recompile = () => {
      const w = Math.max(1, canvas.width);
      const h = Math.max(1, canvas.height);
      plan.dispose();
      const g = snapshotGraph();
      const assets = snapshotAssets();
      try {
        plan = compileGraph(gl, g, { width: w, height: h, assets });
        clearErrors();
        if (plan.errors.length) {
          pushError(plan.errors.map((e) => e.message).join(" | "));
        }
        // Publish diagnostics for shader nodes
        const diagStore = useDiagnosticsStore.getState();
        const shaderNodeIds = g.nodes
          .filter((n) => n.kind === "shader")
          .map((n) => n.id);
        for (const id of shaderNodeIds) {
          const errs = plan.shaderErrors[id] ?? [];
          const d = emptyDiagnostics();
          for (const er of errs) {
            const parsed = parseShaderInfoLog(er.raw);
            if (er.stage === "vertex") d.vertex.push(...parsed);
            else if (er.stage === "fragment") d.fragment.push(...parsed);
            else d.link.push(...parsed);
          }
          diagStore.set(id, d);
        }
      } catch (e) {
        pushError(String(e));
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      let resized = false;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        resized = true;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      return resized;
    };

    setReady(true);

    const onContextLost = (e: Event) => {
      // Calling preventDefault tells the browser the canvas is willing to be
      // restored — without it, `webglcontextrestored` never fires.
      e.preventDefault();
      contextLost = true;
      pushError(CONTEXT_LOST_MSG);
      // Reset bookkeeping so when the context is restored we recompile from
      // scratch. The underlying GL resources are gone — calling dispose on
      // the now-invalid plan just frees JS-side handles.
      lastRev = -1;
      lastAssetRev = -1;
      lastUniformRev = -1;
      lastPassNodeIds = new Set<string>();
    };
    const onContextRestored = () => {
      contextLost = false;
      // Drop stale references the lost plan was holding; recompile() will
      // build a new plan against the freshly-restored context on the next tick.
      plan = emptyPlan(canvas.width || 1, canvas.height || 1);
      // The previous timer pool referenced extension state from the lost
      // context — re-probe so the next tick measures against the fresh GL.
      gpuTimer = GpuTimerPool.create(gl);
      useGpuTimerStore.getState().setSupported(gpuTimer !== null);
      clearErrors();
    };
    canvas.addEventListener("webglcontextlost", onContextLost as EventListener);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    const tick = () => {
      if (!alive) return;
      if (contextLost) {
        // Park the loop until the browser fires `webglcontextrestored`.
        rafId = requestAnimationFrame(tick);
        return;
      }
      const resized = resize();
      const playing = useTimeStore.getState().playing;
      const rev = useGraphStore.getState().rev;
      const assetRev = useAssetStore.getState().rev;
      const uniformRev = useGraphStore.getState().uniformRev;
      const cameraRev = useCameraStore.getState().rev;
      const timeRev = useTimeStore.getState().rev;
      const viewportRev = useViewportStore.getState().rev;

      const structuralDirty =
        rev !== lastRev ||
        assetRev !== lastAssetRev ||
        resized ||
        plan.width !== canvas.width ||
        plan.height !== canvas.height;
      if (structuralDirty) {
        lastRev = rev;
        lastAssetRev = assetRev;
        recompile();
        thumbnailScheduler.bumpAll();
        // Drop async readback slots for passes that were removed: PBO bound
        // to a deleted FBO would copy stale memory next time it fires.
        const nextIds = new Set(plan.passes.map((p) => p.nodeId));
        for (const prev of lastPassNodeIds) {
          if (!nextIds.has(prev)) {
            asyncReadback.release(gl, prev);
            gpuTimer?.release(gl, prev);
            useGpuTimerStore.getState().removeNode(prev);
          }
        }
        lastPassNodeIds = nextIds;
      }
      const uniformChanged = uniformRev !== lastUniformRev;
      if (uniformChanged) {
        lastUniformRev = uniformRev;
        thumbnailScheduler.bumpAll();
      }
      const cameraChanged = cameraRev !== lastCameraRev;
      const timeChanged = timeRev !== lastTimeRev;
      const viewportChanged = viewportRev !== lastViewportRev;
      lastCameraRev = cameraRev;
      lastTimeRev = timeRev;
      lastViewportRev = viewportRev;

      // Static graph guard: when paused with no input changes since last frame
      // there is no reason to re-execute the plan. Camera / param / scrub /
      // bg / graph mutations bump their store rev, which wakes the next frame.
      // External sources (webcam etc.) supply fresh frames every tick, so any
      // graph that contains one stays dirty as long as it exists.
      const needsRender =
        playing ||
        plan.hasExternal ||
        structuralDirty ||
        uniformChanged ||
        cameraChanged ||
        timeChanged ||
        viewportChanged;

      const now = performance.now();
      const dt = now - prev;
      prev = now;
      // Advance simulated shader time honoring play/pause/speed.
      timeStore.getState().advance(dt / 1000);
      frameCount++;
      fpsAccum += dt;
      if (fpsAccum >= 500) {
        const fps = Math.round((frameCount * 1000) / fpsAccum);
        setStats({
          fps,
          frame: frameCount,
          drawCalls: needsRender ? plan.passes.length + 1 : 0,
        });
        frameCount = 0;
        fpsAccum = 0;
      }

      if (!needsRender) {
        // Pump pending readback fences so thumbs issued before the pause
        // eventually commit.
        try {
          for (const r of asyncReadback.poll(gl)) {
            thumbnailScheduler.commit(r.nodeId, r.image, now);
          }
        } catch {
          // Poll failure (e.g., context lost) — drop this frame's results.
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Upload the latest frame from each live external source (webcam etc.)
      // into its backing GL texture. No-op when no external sources exist.
      try {
        updateExternalSources(gl);
      } catch (e) {
        pushError(`External source upload: ${String(e)}`);
      }

      // Pull current uniform values into the plan (cheap). Both shader and
      // compute passes carry slider-driven uniformValues that get hot-patched
      // every frame without recompile.
      const graph = useGraphStore.getState();
      // Build a node lookup once per tick; ids are unique so Map.get matches
      // the prior `.find()` semantics while avoiding O(passes · nodes) scan.
      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
      for (const pass of plan.passes) {
        const node = nodeById.get(pass.nodeId);
        if (!node) continue;
        if (
          (pass.kind === "shader" && node.kind === "shader") ||
          (pass.kind === "compute" && node.kind === "compute")
        ) {
          pass.uniformValues = node.uniformValues;
        }
      }

      const t = useTimeStore.getState().simTime;
      const bg = useViewportStore.getState().background;
      // Build a snapshot of param nodes for the frame.
      const params: Record<string, (typeof graph.nodes)[number]> = {};
      for (const n of graph.nodes) if (n.kind === "param") params[n.id] = n;
      const timerEnabled = useGpuTimerStore.getState().enabled;
      executePlan(
        gl,
        plan,
        {
          time: t,
          width: plan.width,
          height: plan.height,
          camera: useCameraStore.getState().camera,
          background: bg,
          params,
          graph: { nodes: graph.nodes, edges: graph.edges },
        },
        canvas.width,
        canvas.height,
        timerEnabled ? gpuTimer : null,
      );
      bumpRenderTick();

      // Drain any GPU timer queries that completed since the last frame and
      // push the smoothed samples to the store. Disjoint events discard the
      // batch; we ignore that case since the next frame restarts cleanly.
      if (gpuTimer) {
        try {
          const samples = gpuTimer.poll(gl);
          if (samples.length) {
            const store = useGpuTimerStore.getState();
            for (const s of samples) store.setSample(s.nodeId, s.ms);
          }
        } catch {
          // Poll failure (context lost or driver quirk) — drop this batch.
        }
      }

      // Thumbnail readback (10Hz throttle handled by scheduler).
      // Async path: poll signaled fences first so committed images use the
      // latest available frame, then issue fresh requests for nodes whose
      // throttle window elapsed. The GPU pipeline is not stalled — the worst
      // case is a thumbnail trailing the live viewport by a few frames.
      try {
        for (const r of asyncReadback.poll(gl)) {
          thumbnailScheduler.commit(r.nodeId, r.image, now);
        }
      } catch {
        // Poll failure (e.g., context lost) — drop this frame's results.
      }
      const ready = thumbnailScheduler.pickReady(now);
      if (ready.length) {
        for (const id of ready) {
          const pass = plan.passes.find((p) => p.nodeId === id);
          if (!pass || pass.kind !== "shader") continue;
          try {
            asyncReadback.request(gl, id, pass.fbo);
          } catch {
            // Request failure — scheduler entry stays "force next" so we retry.
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener(
        "webglcontextlost",
        onContextLost as EventListener,
      );
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      cameraCtl.detach();
      asyncReadback.disposeAll(gl);
      disposeAllExternal(gl);
      gpuTimer?.dispose(gl);
      gpuTimer = null;
      useGpuTimerStore.getState().reset();
      useGpuTimerStore.getState().setSupported(false);
      plan.dispose();
      setReady(false);
    };
  }, [setReady, setStats, bumpRenderTick, pushError, clearErrors]);

  return (
    <div className="panel panel--viewport">
      <div className="panel-header">Viewport</div>
      <div className="panel-body">
        <canvas
          ref={canvasRef}
          className="viewport-canvas"
          data-testid="viewport-canvas"
        />
      </div>
    </div>
  );
}

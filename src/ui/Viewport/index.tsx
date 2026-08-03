import { useEffect, useRef } from "react";
import { createCameraController } from "../../core/camera/input";
import {
  disposeAllExternal,
  resetExternalTextures,
  updateExternalSources,
} from "../../core/external/registry";
import { createGLContext } from "../../core/gl/context";
import { checkGlError } from "../../core/gl/glError";
import { GpuTimerPool } from "../../core/gl/gpuTimer";
import {
  compileGraph,
  type ExecutionPlan,
  emptyPlan,
} from "../../core/graph/compile";
import { parseShaderInfoLog } from "../../core/graph/diagnostics";
import { executePlan, resetComposite } from "../../core/graph/execute";
import type { GraphNode } from "../../core/graph/types";
import { AsyncThumbnailReadback } from "../../core/thumbnail/asyncReadback";
import {
  DEFAULT_EXPORT_BASE,
  exportFileName,
} from "../../export/exportFileName";
import { snapshotAssets, useAssetStore } from "../../state/assetStore";
import { useCameraStore } from "../../state/cameraStore";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../state/diagnosticsStore";
import { useGifRecorderStore } from "../../state/gifRecorder";
import { useGpuTimerStore } from "../../state/gpuTimerStore";
import { snapshotGraph, useGraphStore } from "../../state/graphStore";
import { mouseVec4, useMouseStore } from "../../state/mouseStore";
import { usePassPlanStore } from "../../state/passPlanStore";
import { useRendererStore } from "../../state/rendererStore";
import { thumbnailScheduler } from "../../state/thumbnailScheduler";
import { useTimeStore } from "../../state/timeStore";
import { toast } from "../../state/toastStore";
import { useViewportStore } from "../../state/viewportStore";
import { log, normalizeError } from "../../utils/log";
import { DockPanelHeader } from "../DockPanelHeader";
import { CompileErrorOverlay } from "./CompileErrorOverlay";
import { EmptyState } from "./EmptyState";
import { PaneOverlay } from "./PaneOverlay";
import { buildPassRows, buildVaryingContracts } from "./passPlanPublish";
import { TransportBar } from "./TransportBar";

/** Output 노드 개수 → Viewport 헤더 메타 배지 텍스트("1 · single" 등, App
 *  Shell.dc.html L215). 분할 구현 전이라도 배지는 현재 그래프 상태를 반영한다. */
function splitLabel(outputCount: number): string {
  if (outputCount <= 1) return "single";
  if (outputCount === 2) return "split";
  if (outputCount === 3) return "triple";
  return "quad";
}

/**
 * Save the canvas' current drawing buffer as a PNG download. Must be called
 * from inside the RAF tick that drew the frame: the GL context is created with
 * `preserveDrawingBuffer: false`, so reading the canvas from an event handler
 * (as the toolbar used to) hands back an already-cleared buffer. Not exported
 * — the request is placed through `rendererStore.requestSnapshot()`. (#3)
 */
function downloadCanvasPng(canvas: HTMLCanvasElement) {
  canvas.toBlob((blob) => {
    if (!blob) {
      toast.error("스냅샷 저장 실패 — 캔버스를 읽지 못했습니다.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(DEFAULT_EXPORT_BASE, "png");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setReady = useRendererStore((s) => s.setReady);
  const setStats = useRendererStore((s) => s.setStats);
  const bumpRenderTick = useRendererStore((s) => s.bumpRenderTick);
  const pushError = useRendererStore((s) => s.pushError);
  const clearErrors = useRendererStore((s) => s.clearErrors);
  const setGlInfo = useRendererStore((s) => s.setGlInfo);
  const glRetryTick = useRendererStore((s) => s.glRetryTick);
  const outputCount = useGraphStore(
    (s) => s.nodes.filter((n) => n.kind === "output").length,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Logged (not just captured for the deps array) so a GpuBlockScreen
    // "Retry detection" click that tears down and re-runs this whole effect
    // is distinguishable in the log from the initial boot attempt.
    log.debug("gl", "GL boot effect (re)start", { glRetryTick });

    let gl: WebGL2RenderingContext;
    try {
      gl = createGLContext(canvas);
    } catch (e) {
      pushError(String(e));
      useRendererStore.getState().setContextUnavailable(true);
      return;
    }
    // Reached only once createGLContext succeeds — clears a prior failed
    // attempt's GpuBlockScreen (retry success path, M7-U5).
    useRendererStore.getState().setContextUnavailable(false);

    // Capture the GL adapter identity once for the diagnostics report. The
    // unmasked names need WEBGL_debug_renderer_info; fall back to the masked
    // RENDERER when the extension is gated (privacy mode).
    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      setGlInfo({
        renderer: String(
          dbg
            ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        ),
        version: String(gl.getParameter(gl.VERSION)),
      });
    } catch (e) {
      log.debug("gl", "glInfo probe failed", normalizeError(e));
    }

    const cameraCtl = createCameraController(useCameraStore.getState().camera);
    cameraCtl.setOnChange((c) => useCameraStore.getState().setCamera(c));
    cameraCtl.attach(canvas);
    // The controller owns a private copy of the pose and only ever reads the
    // store once, at construction. Anything that writes the camera from
    // outside the canvas (TransportBar's Reset view / zoom buttons, share
    // restore) would therefore be discarded by the next drag, which resumes
    // from the controller's stale copy. Mirror external writes back into it.
    // Placed *after* the createGLContext try/catch: the catch path returns
    // without running this cleanup, so subscribing earlier would leak. zustand
    // 5 takes a single listener argument (no selector overload). (#6)
    const unsubscribeCamera = useCameraStore.subscribe((s) => {
      cameraCtl.state = s.camera;
    });

    // Feed pointer position to mouseStore for the u_mouse system uniform.
    // Coordinates are converted to framebuffer pixels with a bottom-left
    // origin so they match gl_FragCoord / u_resolution. These listeners
    // coexist with the camera controller's own pointer handlers.
    const pointerToCanvas = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const px = (e.clientX - rect.left) * scaleX;
      const py = canvas.height - (e.clientY - rect.top) * scaleY;
      return [px, py];
    };
    const onMousePointerMove = (e: PointerEvent) => {
      const [x, y] = pointerToCanvas(e);
      useMouseStore.getState().setPosition(x, y);
    };
    const onMousePointerDown = (e: PointerEvent) => {
      const [x, y] = pointerToCanvas(e);
      useMouseStore.getState().setDown(x, y);
    };
    const onMousePointerUp = () => {
      useMouseStore.getState().setUp();
    };
    canvas.addEventListener("pointermove", onMousePointerMove);
    canvas.addEventListener("pointerdown", onMousePointerDown);
    canvas.addEventListener("pointerup", onMousePointerUp);
    canvas.addEventListener("pointercancel", onMousePointerUp);

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
    let lastMouseRev = -1;
    // Per-tick derived node lookup, rebuilt only when the graph's `nodes`
    // array identity changes. Every store mutation that alters a node —
    // structural (rev) or uniform/param (uniformRev) — produces a fresh
    // `nodes` array via map/spread, so reference equality is a precise,
    // never-stale cache key. (Keying on `rev` alone would miss param value
    // edits, which bump only `uniformRev`.)
    let cachedNodes: GraphNode[] | null = null;
    let cachedNodeById = new Map<string, GraphNode>();
    let alive = true;
    let rafId = 0;
    let prev = performance.now();
    let frameCount = 0;
    // Monotonic count of frames actually rendered, exposed via u_frame.
    let renderFrame = 0;
    let fpsAccum = 0;
    let contextLost = false;
    let glProbeTick = 0;
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
          // Carries the fullscreen-pass substitution through to the overlay's
          // excerpt; absent when the node never reached createProgram.
          const compiledVert = plan.compiledVertexSource[id];
          if (compiledVert !== undefined) d.compiledVertexSource = compiledVert;
          diagStore.set(id, d);
        }
        // Prune diagnostics for shader nodes that no longer exist (deleted /
        // undone / replaced) so ProblemsPanel rows and badge counts don't keep
        // reporting phantom problems (M10).
        diagStore.retainOnly(shaderNodeIds);
        // Publish the Pass Inspector's plan-summary rows (T1/D-1) and each
        // shader node's varying contract (A-2/T4). A fatal validate (cycle
        // etc.) yields `emptyPlan`, which is a transient state — publishing
        // it here would blank the badges/Pass Inspector to a false "0
        // passes" (and drop every varying contract) while the user is
        // mid-drag on a cycle-causing edit. Keep the last real plan's
        // rows/fullscreenByNode/varyingsByNode in that case; `retainOnly`
        // below still runs unconditionally so nodes actually deleted from
        // the graph (including from an all-nodes-removed graph, which can
        // itself produce `errors`) are pruned immediately.
        const passStore = usePassPlanStore.getState();
        const fatal = plan.passes.length === 0 && plan.errors.length > 0;
        if (!fatal) {
          passStore.publish(
            buildPassRows(plan, g, assets),
            plan.fullscreenByNode,
            buildVaryingContracts(plan, g),
          );
        }
        passStore.retainOnly(g.nodes.map((n) => n.id));
        // Publish the drawable Output panes for this plan so DOM overlays can
        // read composite cell membership without recomputing it themselves.
        // Must mirror the `drawable` filter in execute.ts's composite step
        // exactly, so pane order matches composite cell order 1:1.
        const panes: Array<{ outputNodeId: string; sourceNodeId: string }> = [];
        for (const o of plan.outputs) {
          if (
            o.sourceNodeId !== null &&
            plan.shaderPassByNode.has(o.sourceNodeId)
          ) {
            panes.push({
              outputNodeId: o.outputNodeId,
              sourceNodeId: o.sourceNodeId,
            });
          }
        }
        useRendererStore.getState().setPanes(panes);
      } catch (e) {
        // `plan.dispose()` already ran above, so the previous plan's GL objects
        // are gone. Leaving `plan` pointing at it would have the frame loop
        // keep executing a disposed plan every tick. Swap in an empty plan
        // instead — its `dispose` is a no-op, so the next recompile's leading
        // dispose stays safe. (#7)
        plan = emptyPlan(w, h);
        pushError(String(e));
        useRendererStore.getState().setPanes([]);
        // Same "keep last real plan's rows" reasoning as the try branch above
        // — only prune nodes that actually left the graph, never wipe the
        // Pass Inspector's summary because of a transient compile throw.
        usePassPlanStore.getState().retainOnly(g.nodes.map((n) => n.id));
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
      if (resized) {
        useRendererStore
          .getState()
          .setCanvasSize({ width: canvas.width, height: canvas.height });
      }
      return resized;
    };

    setReady(true);

    const onContextLost = (e: Event) => {
      // Calling preventDefault tells the browser the canvas is willing to be
      // restored — without it, `webglcontextrestored` never fires.
      e.preventDefault();
      contextLost = true;
      pushError(CONTEXT_LOST_MSG);
      const statusMessage = (e as WebGLContextEvent).statusMessage;
      log.error(
        "gl",
        "WebGL context lost",
        statusMessage ? { statusMessage } : undefined,
      );
      // Reset bookkeeping so when the context is restored we recompile from
      // scratch. The underlying GL resources are gone — calling dispose on
      // the now-invalid plan just frees JS-side handles.
      lastRev = -1;
      lastAssetRev = -1;
      lastUniformRev = -1;
      lastPassNodeIds = new Set<string>();
      // Module-global GL singletons aren't reachable from recompile(): drop the
      // composite pipeline and thumbnail readback so they rebuild against the
      // restored context instead of reusing dead handles. WebGL reuses the same
      // `gl` object across loss, so deletes here are safe no-ops; the point is
      // to clear the cached JS references.
      resetComposite(gl);
      asyncReadback.disposeAll(gl);
      // Live external sources (webcam/video/audio) outlive the plan, so their
      // cached GL textures are not covered by the recompile above. Drop the now
      // dead texture handles so the first tick after restore re-creates them
      // instead of texSubImage2D-ing into nothing. (#13)
      resetExternalTextures();
    };
    const onContextRestored = () => {
      contextLost = false;
      log.info("gl", "WebGL context restored");
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
        // A snapshot can't be served while the context is gone, and holding
        // the request would fire it on some arbitrary frame long after the
        // user asked. Drop it and say so. (#3)
        if (useRendererStore.getState().consumeSnapshotRequest()) {
          toast.error("GPU 컨텍스트 손실 — 스냅샷을 저장하지 못했습니다.");
        }
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
      const mouseRev = useMouseStore.getState().rev;

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
      const mouseChanged = mouseRev !== lastMouseRev;
      lastCameraRev = cameraRev;
      lastTimeRev = timeRev;
      lastViewportRev = viewportRev;
      lastMouseRev = mouseRev;

      // Static graph guard: when paused with no input changes since last frame
      // there is no reason to re-execute the plan. Camera / param / scrub /
      // bg / graph mutations bump their store rev, which wakes the next frame.
      // External sources (webcam etc.) supply fresh frames every tick, so any
      // graph that contains one stays dirty as long as it exists.
      // While a GIF recording is active we must keep rendering so frames keep
      // arriving at a steady cadence even on an otherwise-static graph.
      const gifRecording =
        useGifRecorderStore.getState().status === "recording";
      // A pending PNG snapshot must force one real draw: the capture reads the
      // drawing buffer right after executePlan, and on a paused static graph
      // the idle gate below would otherwise skip straight past it forever. (#3)
      const snapshotPending = useRendererStore.getState().snapshotRequested;

      const needsRender =
        playing ||
        plan.hasExternal ||
        gifRecording ||
        snapshotPending ||
        structuralDirty ||
        uniformChanged ||
        cameraChanged ||
        timeChanged ||
        viewportChanged ||
        mouseChanged;

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
        // Pump pending readback fences so thumbs issued before (or during) the
        // pause eventually commit.
        try {
          for (const r of asyncReadback.poll(gl)) {
            thumbnailScheduler.commit(r.nodeId, r.image, now);
          }
        } catch (e) {
          // Poll failure (e.g., context lost) — drop this frame's results.
          log.debug(
            "render",
            "thumbnail readback poll failed",
            normalizeError(e),
          );
        }
        // Fill in thumbnails for cards that still need a first capture — e.g.
        // a node scrolled into view while paused (L16). Only forced/uncaptured
        // nodes (pickForced), never throttle-driven, so once every visible card
        // is captured this issues nothing and the loop stays idle. The readback
        // downsamples the pass's already-rendered FBO into a separate thumb FBO;
        // it neither re-executes the plan nor bumps renderTick, so the B2 idle
        // guarantee (paused static graph stops *rendering*) is preserved.
        const forced = thumbnailScheduler.pickForced();
        for (const id of forced) {
          const pass = plan.passes.find((p) => p.nodeId === id);
          if (!pass || pass.kind !== "shader") continue;
          try {
            asyncReadback.request(gl, id, pass.fbo);
          } catch {
            // Request failure — scheduler entry stays forceNext so we retry.
          }
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
      // every frame without recompile. Replacing the whole map is safe for
      // the C-2 `@default` seeds because they live in the pass's separate
      // `seededDefaults` field — `bindUserUniforms` composes
      // `{...seededDefaults, ...uniformValues}` per frame, so this
      // assignment can no longer clobber a seed before its first draw.
      const graph = useGraphStore.getState();
      // Rebuild the node lookup only when the graph's `nodes` array identity
      // changes (see the cachedNodes declaration). It is a pure function of
      // `graph.nodes`, so an unchanged reference means an identical result —
      // skipping the O(nodes) Map construction every steady-state frame. The
      // pass-patch loop below still runs each frame because `plan.passes` can
      // be rebuilt (e.g. on resize) while `graph.nodes` stays put, and the new
      // pass objects need re-patching.
      if (graph.nodes !== cachedNodes) {
        cachedNodes = graph.nodes;
        cachedNodeById = new Map(graph.nodes.map((n) => [n.id, n]));
      }
      const nodeById = cachedNodeById;
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
          graph: { nodes: graph.nodes, edges: graph.edges },
          mouse: mouseVec4(useMouseStore.getState()),
          frame: renderFrame++,
        },
        canvas.width,
        canvas.height,
        timerEnabled ? gpuTimer : null,
      );
      bumpRenderTick();

      // GIF capture must read the drawing buffer in the same tick as the draw
      // (the context uses preserveDrawingBuffer: false). The store throttles
      // captures to its target fps internally.
      if (gifRecording) {
        const gif = useGifRecorderStore.getState();
        gif.captureFrame(canvas);
        gif.tick();
      }

      // Same constraint as the GIF capture above: the PNG snapshot has to read
      // the drawing buffer in the tick that drew it. `snapshotPending` above
      // already forced this frame past the idle gate. (#3)
      if (useRendererStore.getState().consumeSnapshotRequest()) {
        downloadCanvasPng(canvas);
      }

      // DEV-only GL error probe, throttled — gl.getError() forces a sync GPU
      // flush, so we sample every Nth frame rather than per-frame. No-op in
      // production (checkGlError short-circuits before touching the context).
      if (import.meta.env.DEV && ++glProbeTick % 120 === 0) {
        checkGlError(gl, "draw loop");
      }

      // Drain any GPU timer queries that completed since the last frame and
      // push the smoothed samples to the store. Disjoint events discard the
      // batch; we ignore that case since the next frame restarts cleanly.
      if (gpuTimer) {
        try {
          const samples = gpuTimer.poll(gl);
          if (samples.length) {
            const store = useGpuTimerStore.getState();
            store.setSamples(samples);
          }
        } catch (e) {
          // Poll failure (context lost or driver quirk) — drop this batch.
          log.debug("render", "GPU timer poll failed", normalizeError(e));
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
      } catch (e) {
        // Poll failure (e.g., context lost) — drop this frame's results.
        log.debug(
          "render",
          "thumbnail readback poll failed",
          normalizeError(e),
        );
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
      // A pending snapshot has exactly one server — this loop. Leaving the flag
      // armed would fire it on the first frame after the *next* mount, so a
      // reopened (or merely re-docked) Viewport downloads a PNG nobody asked
      // for. Same hazard the context-loss path above already handles, same
      // treatment: drop it and say so. (F1)
      //
      // The window is at most one frame wide — `snapshotPending` forces the idle
      // gate open, so the tick that follows a request always consumes it — and
      // the teardown is not necessarily a panel close: removing *any* leaf, a
      // tab drag, or `addPanel` reshapes the tree enough for React to remount
      // this subtree. Hence the deliberately cause-neutral wording.
      if (useRendererStore.getState().consumeSnapshotRequest()) {
        toast.error(
          "Viewport 렌더 루프가 중단되어 스냅샷을 저장하지 못했습니다.",
        );
      }
      canvas.removeEventListener(
        "webglcontextlost",
        onContextLost as EventListener,
      );
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      canvas.removeEventListener("pointermove", onMousePointerMove);
      canvas.removeEventListener("pointerdown", onMousePointerDown);
      canvas.removeEventListener("pointerup", onMousePointerUp);
      canvas.removeEventListener("pointercancel", onMousePointerUp);
      unsubscribeCamera();
      cameraCtl.detach();
      asyncReadback.disposeAll(gl);
      disposeAllExternal(gl);
      gpuTimer?.dispose(gl);
      gpuTimer = null;
      useGpuTimerStore.getState().reset();
      useGpuTimerStore.getState().setSupported(false);
      plan.dispose();
      setReady(false);
      useRendererStore.getState().setPanes([]);
    };
    // glRetryTick is a deliberate dep (see the log.debug call above): bumping
    // it via retryGlContext() tears down and re-runs this whole effect,
    // which is the only way to retry a failed createGLContext.
  }, [
    setReady,
    setStats,
    bumpRenderTick,
    pushError,
    clearErrors,
    setGlInfo,
    glRetryTick,
  ]);

  return (
    <div className="panel panel--viewport">
      <DockPanelHeader meta={`${outputCount} · ${splitLabel(outputCount)}`} />
      <div className="panel-body">
        <canvas
          ref={canvasRef}
          className="viewport-canvas"
          data-testid="viewport-canvas"
        />
        <EmptyState />
        <CompileErrorOverlay />
        <PaneOverlay />
        <TransportBar />
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { createCameraController } from "../../core/camera/input";
import { createGLContext } from "../../core/gl/context";
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
import { snapshotGraph, useGraphStore } from "../../state/graphStore";
import { useRendererStore } from "../../state/rendererStore";
import { thumbnailScheduler } from "../../state/thumbnailScheduler";
import { useTimeStore } from "../../state/timeStore";
import { useViewportStore } from "../../state/viewportStore";

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setReady = useRendererStore((s) => s.setReady);
  const setStats = useRendererStore((s) => s.setStats);
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
    let lastPassNodeIds = new Set<string>();
    let lastRev = -1;
    let lastAssetRev = -1;
    let lastUniformRev = -1;
    let alive = true;
    let rafId = 0;
    let prev = performance.now();
    let frameCount = 0;
    let fpsAccum = 0;
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

    const tick = () => {
      if (!alive) return;
      const resized = resize();
      const rev = useGraphStore.getState().rev;
      const assetRev = useAssetStore.getState().rev;
      const uniformRev = useGraphStore.getState().uniformRev;
      if (
        rev !== lastRev ||
        assetRev !== lastAssetRev ||
        resized ||
        plan.width !== canvas.width ||
        plan.height !== canvas.height
      ) {
        lastRev = rev;
        lastAssetRev = assetRev;
        recompile();
        thumbnailScheduler.bumpAll();
        // Drop async readback slots for passes that were removed: PBO bound
        // to a deleted FBO would copy stale memory next time it fires.
        const nextIds = new Set(plan.passes.map((p) => p.nodeId));
        for (const prev of lastPassNodeIds) {
          if (!nextIds.has(prev)) asyncReadback.release(gl, prev);
        }
        lastPassNodeIds = nextIds;
      }
      if (uniformRev !== lastUniformRev) {
        lastUniformRev = uniformRev;
        thumbnailScheduler.bumpAll();
      }
      // Pull current uniform values into the plan (cheap)
      const graph = useGraphStore.getState();
      for (const pass of plan.passes) {
        const node = graph.nodes.find((n) => n.id === pass.nodeId);
        if (node && node.kind === "shader") {
          pass.uniformValues = node.uniformValues;
        }
      }

      const now = performance.now();
      const dt = now - prev;
      prev = now;
      // Advance simulated shader time honoring play/pause/speed.
      timeStore.getState().advance(dt / 1000);
      frameCount++;
      fpsAccum += dt;
      if (fpsAccum >= 500) {
        const fps = Math.round((frameCount * 1000) / fpsAccum);
        setStats({ fps, frame: frameCount, drawCalls: plan.passes.length + 1 });
        frameCount = 0;
        fpsAccum = 0;
      }

      const t = useTimeStore.getState().simTime;
      const bg = useViewportStore.getState().background;
      // Build a snapshot of param nodes for the frame.
      const params: Record<string, (typeof graph.nodes)[number]> = {};
      for (const n of graph.nodes) if (n.kind === "param") params[n.id] = n;
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
      );

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
          if (!pass) continue;
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
      cameraCtl.detach();
      asyncReadback.disposeAll(gl);
      plan.dispose();
      setReady(false);
    };
  }, [setReady, setStats, pushError, clearErrors]);

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

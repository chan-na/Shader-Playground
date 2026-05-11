import { useEffect, useRef } from 'react';
import { useGraphStore, snapshotGraph } from '../../state/graphStore';
import { useRendererStore } from '../../state/rendererStore';
import { useCameraStore } from '../../state/cameraStore';
import { createGLContext } from '../../core/gl/context';
import { compileGraph, emptyPlan, type ExecutionPlan } from '../../core/graph/compile';
import { executePlan } from '../../core/graph/execute';
import { createCameraController } from '../../core/camera/input';
import { createDemoGraph } from '../../state/demoGraph';

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setReady = useRendererStore((s) => s.setReady);
  const setStats = useRendererStore((s) => s.setStats);
  const pushError = useRendererStore((s) => s.pushError);
  const clearErrors = useRendererStore((s) => s.clearErrors);

  // Bootstrap demo graph on first mount if empty
  useEffect(() => {
    if (useGraphStore.getState().nodes.length === 0) {
      useGraphStore.getState().setGraph(createDemoGraph());
    }
  }, []);

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
    let lastRev = -1;
    let alive = true;
    let rafId = 0;
    const start = performance.now();
    let prev = start;
    let frameCount = 0;
    let fpsAccum = 0;

    const recompile = () => {
      const w = Math.max(1, canvas.width);
      const h = Math.max(1, canvas.height);
      plan.dispose();
      const g = snapshotGraph();
      try {
        plan = compileGraph(gl, g, { width: w, height: h });
        clearErrors();
        if (plan.errors.length) {
          pushError(plan.errors.map((e) => e.message).join(' | '));
        }
        const compileMsgs: string[] = [];
        for (const [id, errs] of Object.entries(plan.shaderErrors)) {
          for (const er of errs) {
            compileMsgs.push(`[${id}:${er.stage}] ${er.message.trim()}`);
          }
        }
        if (compileMsgs.length) pushError(compileMsgs.join(' | '));
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
      if (rev !== lastRev || resized || plan.width !== canvas.width || plan.height !== canvas.height) {
        lastRev = rev;
        recompile();
      }
      // Pull current uniform values into the plan (cheap)
      const graph = useGraphStore.getState();
      for (const pass of plan.passes) {
        const node = graph.nodes.find((n) => n.id === pass.nodeId);
        if (node && node.kind === 'shader') {
          pass.uniformValues = node.uniformValues;
        }
      }

      const now = performance.now();
      const dt = now - prev;
      prev = now;
      frameCount++;
      fpsAccum += dt;
      if (fpsAccum >= 500) {
        const fps = Math.round((frameCount * 1000) / fpsAccum);
        setStats({ fps, frame: frameCount, drawCalls: plan.passes.length + 1 });
        frameCount = 0;
        fpsAccum = 0;
      }

      const t = (now - start) / 1000;
      executePlan(
        gl,
        plan,
        {
          time: t,
          width: plan.width,
          height: plan.height,
          camera: useCameraStore.getState().camera,
        },
        canvas.width,
        canvas.height,
      );

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      cameraCtl.detach();
      plan.dispose();
      setReady(false);
    };
  }, [setReady, setStats, pushError, clearErrors]);

  return (
    <div className="panel panel--viewport">
      <div className="panel-header">Viewport</div>
      <div className="panel-body">
        <canvas ref={canvasRef} className="viewport-canvas" />
      </div>
    </div>
  );
}

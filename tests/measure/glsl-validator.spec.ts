/**
 * M0 SPIKE (throwaway) — measure the OffscreenCanvas WebGL2 worker backend
 * for live GLSL validation.
 *
 * Goals:
 *   - Confirm a Web Worker with OffscreenCanvas + WebGL2 is usable in the
 *     SwiftShader test env (this is the gating environmental risk).
 *   - Measure worker init time, cold/warm validate latency.
 *   - Confirm the log produced by the worker matches the main-thread WebGL2
 *     context for several canonical shaders.
 *   - Estimate JS payload weight (worker source size in bytes).
 *
 * Run manually:
 *     npx playwright test --config=playwright.measure.config.ts
 */

import { expect, test } from "@playwright/test";

// Self-contained worker source. Posts {ready:true} synchronously so the main
// thread can clock init; lazy-initialises the GL context on the first
// validate request so race against the main-thread listener cannot strand us.
const WORKER_SRC = `
  self.postMessage({ ready: true });
  let gl = null;
  let glError = null;
  function ensureGl() {
    if (gl || glError) return;
    try {
      const off = new OffscreenCanvas(1, 1);
      const ctx = off.getContext('webgl2');
      if (!ctx) { glError = 'no webgl2 context'; return; }
      gl = ctx;
    } catch (e) {
      glError = String(e && e.message || e);
    }
  }
  self.onmessage = (e) => {
    const { reqId, stage, source } = e.data || {};
    if (reqId == null) return;
    ensureGl();
    if (!gl) {
      self.postMessage({ reqId, log: 'glError: ' + glError, ok: false });
      return;
    }
    const type = stage === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    const log = ok ? '' : (gl.getShaderInfoLog(sh) || '');
    gl.deleteShader(sh);
    self.postMessage({ reqId, log, ok: !!ok });
  };
`;

const SHADERS: { name: string; stage: "vertex" | "fragment"; src: string }[] = [
  {
    name: "valid_fragment_300es",
    stage: "fragment",
    src: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_t;
out vec4 outColor;
void main() {
  outColor = vec4(v_uv, sin(u_t), 1.0);
}`,
  },
  {
    name: "valid_vertex_300es",
    stage: "vertex",
    src: `#version 300 es
in vec3 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 1.0);
}`,
  },
  {
    name: "missing_semicolon",
    stage: "fragment",
    src: `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(1.0)
}`,
  },
  {
    name: "undeclared_identifier",
    stage: "fragment",
    src: `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(undefined_thing, 0.0, 0.0, 1.0);
}`,
  },
  {
    name: "type_mismatch",
    stage: "fragment",
    src: `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  vec3 x = vec3(1.0);
  outColor = x;
}`,
  },
];

test.describe("M0 — OffscreenCanvas WebGL2 worker validator measurements", () => {
  test.setTimeout(60_000);

  test("init + validate latency + authority equivalence", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Forward console logs from inside the page so Playwright stdout shows
    // them even when the evaluate throws.
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        // eslint-disable-next-line no-console
        console.log("[page]", msg.text());
      }
    });

    const result = await page.evaluate(
      async ({ workerSrc, shaders }) => {
        const phases: string[] = [];
        phases.push("start");

        function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
          return Promise.race<T>([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error(`timeout: ${label}`)), ms),
            ),
          ]);
        }

        const blob = new Blob([workerSrc], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);

        phases.push("worker:construct");
        const tInitStart = performance.now();
        let worker: Worker;
        try {
          worker = new Worker(url);
        } catch (e) {
          return {
            phases,
            error: `Worker construct failed: ${String(e)}`,
          };
        }

        // Set onmessage synchronously in the same task so the worker's first
        // postMessage (sent synchronously inside its module) cannot fire
        // before we are subscribed.
        const ready = await withTimeout(
          new Promise<{ error?: string }>((resolve) => {
            worker.onmessage = (ev) => {
              if (ev.data?.ready) {
                worker.onmessage = null;
                resolve({ error: ev.data.error });
              }
            };
          }),
          5_000,
          "worker ready",
        ).catch((e) => ({ error: String(e) }));

        const tInitMs = performance.now() - tInitStart;
        phases.push(`worker:ready (${tInitMs.toFixed(1)}ms)`);
        if (ready.error) {
          worker.terminate();
          return { phases, initMs: tInitMs, error: ready.error };
        }

        let reqId = 0;
        const pending = new Map<
          number,
          (m: { log: string; ok: boolean }) => void
        >();
        worker.addEventListener("message", (ev: MessageEvent) => {
          const d = ev.data;
          if (d && typeof d.reqId === "number") {
            const r = pending.get(d.reqId);
            if (r) {
              pending.delete(d.reqId);
              r({ log: d.log, ok: d.ok });
            }
          }
        });
        function validateInWorker(
          stage: "vertex" | "fragment",
          source: string,
        ): Promise<{ log: string; ok: boolean }> {
          const id = ++reqId;
          return withTimeout(
            new Promise<{ log: string; ok: boolean }>((resolve) => {
              pending.set(id, resolve);
              worker.postMessage({ reqId: id, stage, source });
            }),
            5_000,
            `validate reqId=${id}`,
          );
        }

        const mainCanvas = document.createElement("canvas");
        const ctx = mainCanvas.getContext("webgl2");
        if (!ctx) {
          worker.terminate();
          return { phases, initMs: tInitMs, error: "no webgl2 on main thread" };
        }
        // Capture as a non-nullable const so the nested validator below can
        // rely on TS narrowing without per-call non-null assertions.
        const mainGl: WebGL2RenderingContext = ctx;
        function validateMain(
          stage: "vertex" | "fragment",
          source: string,
        ): { log: string; ok: boolean } {
          const t =
            stage === "vertex" ? mainGl.VERTEX_SHADER : mainGl.FRAGMENT_SHADER;
          const sh = mainGl.createShader(t);
          if (!sh) return { log: "createShader failed", ok: false };
          mainGl.shaderSource(sh, source);
          mainGl.compileShader(sh);
          const ok = !!mainGl.getShaderParameter(sh, mainGl.COMPILE_STATUS);
          const log = ok ? "" : mainGl.getShaderInfoLog(sh) || "";
          mainGl.deleteShader(sh);
          return { log, ok };
        }

        phases.push("validate:start");
        type Row = {
          name: string;
          stage: string;
          coldMs: number;
          warmAvgMs: number;
          workerOk: boolean;
          mainOk: boolean;
          okMatches: boolean;
          logsExactMatch: boolean;
          firstLineWorker: string;
          firstLineMain: string;
        };
        const rows: Row[] = [];
        try {
          for (const s of shaders) {
            const cT0 = performance.now();
            const workerRes = await validateInWorker(s.stage, s.src);
            const coldMs = performance.now() - cT0;
            const N = 50;
            const wT0 = performance.now();
            for (let i = 0; i < N; i++) {
              await validateInWorker(s.stage, s.src);
            }
            const warmAvgMs = (performance.now() - wT0) / N;
            const mainRes = validateMain(s.stage, s.src);
            const firstLine = (str: string) =>
              (str.split(/\r?\n/)[0] || "").trim();
            rows.push({
              name: s.name,
              stage: s.stage,
              coldMs,
              warmAvgMs,
              workerOk: workerRes.ok,
              mainOk: mainRes.ok,
              okMatches: workerRes.ok === mainRes.ok,
              logsExactMatch: workerRes.log === mainRes.log,
              firstLineWorker: firstLine(workerRes.log),
              firstLineMain: firstLine(mainRes.log),
            });
          }
        } catch (e) {
          worker.terminate();
          return {
            phases: [...phases, `error: ${String(e)}`],
            initMs: tInitMs,
            workerSrcBytes: workerSrc.length,
            rows,
            error: String(e),
          };
        }
        phases.push("validate:done");
        worker.terminate();
        URL.revokeObjectURL(url);

        return {
          phases,
          initMs: tInitMs,
          workerSrcBytes: workerSrc.length,
          rows,
        };
      },
      { workerSrc: WORKER_SRC, shaders: SHADERS },
    );

    // eslint-disable-next-line no-console
    console.log("\n=== M0 OffscreenCanvas WebGL2 validator — measurements ===");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log("=== end M0 ===\n");

    expect(result.error).toBeUndefined();
    expect(result.rows?.length).toBe(SHADERS.length);
  });
});

/**
 * Live GLSL validation worker (Phase 24).
 *
 * Holds a singleton OffscreenCanvas WebGL2 context off the main thread and
 * compiles user shaders against it on demand. We send back the raw info log
 * — the client uses the existing `parseShaderInfoLog` to turn it into
 * structured diagnostics, so no driver-format knowledge lives here.
 *
 * Protocol:
 *   in : { type: 'validate', reqId, stage: 'vertex'|'fragment', source }
 *   out: { type: 'validate', reqId, log: string, ok: boolean }
 *
 * Lifecycle:
 *   - GL is lazily initialised on the first request (so worker construction
 *     stays cheap and the GL context isn't created for `dispose()`-fast
 *     paths). Init failures are captured into `glError` and reported per
 *     request — the client treats this as "no diagnostics available" and
 *     keeps relying on the authoritative recompile path.
 *
 * M0 measurement (tests/measure/glsl-validator.spec.ts) verified that the
 * log produced by an OffscreenCanvas WebGL2 context matches the main-thread
 * context byte-for-byte across syntax / undeclared-identifier / type-mismatch
 * cases on Chromium+SwiftShader.
 */

// Worker globals (avoid pulling the full DOM "Window" lib into the file).
declare const self: {
  postMessage(data: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

export type GlslStage = "vertex" | "fragment";

export interface GlslValidateRequest {
  type: "validate";
  reqId: number;
  stage: GlslStage;
  source: string;
}

export interface GlslValidateResponse {
  type: "validate";
  reqId: number;
  log: string;
  ok: boolean;
}

let gl: WebGL2RenderingContext | null = null;
let glError: string | null = null;

function ensureGl(): WebGL2RenderingContext | null {
  if (gl) return gl;
  if (glError) return null;
  try {
    const off = new OffscreenCanvas(1, 1);
    const ctx = off.getContext("webgl2");
    if (!ctx) {
      glError = "no webgl2 context";
      return null;
    }
    gl = ctx;
    return gl;
  } catch (e) {
    glError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

function reply(reqId: number, log: string, ok: boolean): void {
  const msg: GlslValidateResponse = { type: "validate", reqId, log, ok };
  self.postMessage(msg);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data as GlslValidateRequest | undefined;
  if (!m || m.type !== "validate" || typeof m.reqId !== "number") return;

  const ctx = ensureGl();
  if (!ctx) {
    reply(m.reqId, `glError: ${glError ?? "unknown"}`, false);
    return;
  }
  const type = m.stage === "vertex" ? ctx.VERTEX_SHADER : ctx.FRAGMENT_SHADER;
  const sh = ctx.createShader(type);
  if (!sh) {
    reply(m.reqId, "createShader failed", false);
    return;
  }
  ctx.shaderSource(sh, m.source);
  ctx.compileShader(sh);
  const ok = !!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS);
  const log = ok ? "" : ctx.getShaderInfoLog(sh) || "";
  ctx.deleteShader(sh);
  reply(m.reqId, log, ok);
};

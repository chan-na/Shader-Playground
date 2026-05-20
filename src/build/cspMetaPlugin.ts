import type { Plugin } from "vite";

/**
 * Build-only CSP meta injector.
 *
 * Vite's dev server requires inline scripts and `eval` for HMR / module
 * preloads, so a strict CSP would break local development and Playwright
 * (which uses `npm run dev`). We therefore only inject the policy into the
 * production HTML emitted by `vite build`.
 *
 * Policy notes:
 * - `script-src 'self'` — no inline scripts in production; Vite emits hashed
 *   module bundles only. The exported standalone HTML player follows a
 *   different code path and is unaffected.
 * - `style-src 'self' 'unsafe-inline'` — React's `style={{ ... }}` props
 *   render as inline `style="…"` attributes; tightening this requires a
 *   styling overhaul (out of scope for this guard).
 * - `img-src` allows `data:` and `blob:` for asset thumbnails and viewport
 *   snapshots.
 * - `media-src 'self' blob:` — imported video/audio assets are mounted on
 *   `<video>` / `<audio>` elements via `URL.createObjectURL`. Without this the
 *   policy falls back to `default-src 'self'` and Chrome rejects the blob URL
 *   with MEDIA_ERR_SRC_NOT_SUPPORTED ("Media load rejected by URL safety
 *   check"). Dev is unaffected because the meta is build-only.
 * - `connect-src 'self'` — the app does no external fetch.
 * - `worker-src 'self' blob:` — leaves room for future worker offloading
 *   without re-touching CSP.
 * - `object-src 'none'` / `base-uri 'self'` / `form-action 'none'` /
 *   `frame-ancestors 'none'` — closes legacy injection vectors.
 */
export const CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function injectCspMeta(html: string, content: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${content}" />`;
  // Place the meta as the very first <head> child so it applies before any
  // subsequent <script> / <link> the page emits.
  return html.replace(
    /<head>([\s\S]*?)/,
    (_match, rest: string) => `<head>\n    ${meta}${rest}`,
  );
}

export function cspMetaPlugin(): Plugin {
  return {
    name: "shaderplayground-csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return injectCspMeta(html, CSP_CONTENT);
      },
    },
  };
}

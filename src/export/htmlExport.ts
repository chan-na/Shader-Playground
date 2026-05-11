import type { Graph } from "../core/graph/types";
import type { NodePosition } from "../state/graphStore";
import { serializeProject } from "../state/serialization";
import standalonePlayer from "./standalonePlayer.js?raw";

/**
 * Build a self-contained HTML file string that renders `graph` against a
 * canvas at `width × height` without any external runtime. The standalone
 * player from src/export/standalonePlayer.js is inlined verbatim.
 */
export function buildExportedHtml(
  graph: Graph,
  positions: Record<string, NodePosition>,
  opts?: { title?: string; width?: number; height?: number },
): string {
  const project = serializeProject(graph, positions);
  const title = opts?.title ?? "Shader Playground export";
  const w = opts?.width ?? 800;
  const h = opts?.height ?? 600;
  // Inline JSON safely — close </script> and -- escapes prevent injection.
  const safeJson = JSON.stringify(project)
    .replace(/<\/script>/gi, "<\\/script>")
    .replace(/<!--/g, "<\\!--");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="generator" content="Shader Playground">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #111; color: #ddd; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; overflow: hidden; }
  #canvas { display: block; width: 100%; height: 100%; background: #000; }
  .badge { position: fixed; right: 8px; bottom: 8px; background: rgba(0,0,0,0.45); padding: 4px 8px; border-radius: 4px; font-size: 11px; opacity: 0.6; }
  .badge a { color: #ddd; text-decoration: none; }
</style>
</head>
<body>
<canvas id="canvas" width="${w}" height="${h}"></canvas>
<div class="badge">Exported from <a href="https://github.com">Shader Playground</a></div>
<script>window.__SP_PROJECT = ${safeJson};</script>
<script>${standalonePlayer}</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadExportedHtml(
  graph: Graph,
  positions: Record<string, NodePosition>,
  title = "shader-playground",
) {
  const html = buildExportedHtml(graph, positions, { title });
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}-${Date.now()}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

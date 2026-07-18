import type { Graph } from "../core/graph/types";
import { serializeProject } from "../state/serialization";
import type { NodePosition } from "../state/types";
import { tokens } from "../theme";
import { DEFAULT_EXPORT_BASE, exportFileName } from "./exportFileName";
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
  // Inline JSON safely. Escaping every `<` as `<` neutralises all
  // `<`-based script breakouts (`</script>`, `</script ` with whitespace/slash,
  // `<!--`, …) — the JS string literal parser turns `<` back into `<`, so
  // the runtime value is unchanged while the HTML parser never sees a raw `<`.
  const safeJson = JSON.stringify(project).replace(/</g, "\\u003c");

  // 이 <style>의 색 값은 전부 src/theme.ts의 tokens.*를 빌드 시점에 문자열로
  // 보간한 것이다 (D5). 산출물은 앱 CSS 변수 스코프 밖에서 열리므로 var()를
  // 쓸 수 없다 — canvas 2D가 tokens를 직접 import하는 것[D7]과 같은 원리로
  // 여기서도 tokens 값을 직접 참조한다. 항목별 근사 사유:
  //  - html/body background·color: surface.app / text.primary [D5 확정값]
  //  - font-family: tokens.font.ui 그대로 사용. IBM Plex Sans 서브셋 번들은
  //    CHANGELOG §v1.3 Q10에서 공식 취소됐다(번들 예산 385 KiB 여유 ~2.1 KiB
  //    충돌 + woff2 산출물 부재) — system-ui 폴백이 정본이고 브랜드 타이포는
  //    앱 UI 에만 로드한다(design/README.md §H). 산출물은 실제로 system-ui
  //    폴백으로 렌더된다 — 토큰의 폴백 체인을 그대로 신뢰한다 [D5].
  //    tokens.font.ui 안의 작은따옴표는 유효한 CSS 값이므로 보간에 문제 없다.
  //  - #canvas background: surface.letterbox(=appDarker) — 레터박스 성격의
  //    캔버스 바탕으로 근사 [D5/D8].
  //  - .badge background: overlay.scrim(rgba(0,0,0,0.5)) — 구 값 0.45를
  //    명명 토큰(0.5)으로 근사 [D9].
  //  - .badge a color: text.primary. badge 자체의 기존 opacity:0.6이 muted
  //    느낌을 담당하므로 별도 muted 색을 쓰지 않고 값을 보존한다.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="generator" content="Shader Playground">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${tokens.surface.app}; color: ${tokens.text.primary}; font-family: ${tokens.font.ui}; overflow: hidden; }
  #canvas { display: block; width: 100%; height: 100%; background: ${tokens.surface.letterbox}; }
  .badge { position: fixed; right: 8px; bottom: 8px; background: ${tokens.overlay.scrim}; padding: 4px 8px; border-radius: 4px; font-size: 11px; opacity: 0.6; }
  .badge a { color: ${tokens.text.primary}; text-decoration: none; }
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

/**
 * Downloads the standalone export and returns the file name it was actually
 * saved under [D16] — callers (the Export & Share done card/toast) must
 * display this return value rather than re-deriving a name themselves, so
 * displayed name and saved name can never drift apart.
 */
export function downloadExportedHtml(
  graph: Graph,
  positions: Record<string, NodePosition>,
  baseName = DEFAULT_EXPORT_BASE,
): string {
  const html = buildExportedHtml(graph, positions, { title: baseName });
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const finalName = exportFileName(baseName, "html");
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return finalName;
}

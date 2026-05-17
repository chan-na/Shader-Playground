import { describe, expect, it } from "vitest";
import { CSP_CONTENT, cspMetaPlugin, injectCspMeta } from "./cspMetaPlugin";

const SAMPLE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>Shader Playground</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("injectCspMeta", () => {
  it("inserts the meta tag as the first <head> child", () => {
    const out = injectCspMeta(SAMPLE_HTML, CSP_CONTENT);
    const headIdx = out.indexOf("<head>");
    const metaIdx = out.indexOf('http-equiv="Content-Security-Policy"');
    const charsetIdx = out.indexOf('charset="UTF-8"');
    expect(headIdx).toBeGreaterThan(-1);
    expect(metaIdx).toBeGreaterThan(headIdx);
    expect(metaIdx).toBeLessThan(charsetIdx);
  });

  it("preserves the original body / scripts intact", () => {
    const out = injectCspMeta(SAMPLE_HTML, CSP_CONTENT);
    expect(out).toContain('<div id="root"></div>');
    expect(out).toContain("Shader Playground");
  });
});

describe("CSP_CONTENT policy", () => {
  it("forbids inline scripts (no 'unsafe-inline' on script-src)", () => {
    const directives = CSP_CONTENT.split(";").map((d) => d.trim());
    const scriptSrc = directives.find((d) => d.startsWith("script-src "));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toMatch(/unsafe-inline/);
    expect(scriptSrc).not.toMatch(/unsafe-eval/);
  });

  it("permits inline styles (React style props rely on them)", () => {
    expect(CSP_CONTENT).toMatch(/style-src [^;]*'unsafe-inline'/);
  });

  it("allows data: and blob: image sources for thumbnails / snapshots", () => {
    expect(CSP_CONTENT).toMatch(/img-src [^;]*data:/);
    expect(CSP_CONTENT).toMatch(/img-src [^;]*blob:/);
  });

  it("locks down object-src, base-uri, form-action, frame-ancestors", () => {
    expect(CSP_CONTENT).toContain("object-src 'none'");
    expect(CSP_CONTENT).toContain("base-uri 'self'");
    expect(CSP_CONTENT).toContain("form-action 'none'");
    expect(CSP_CONTENT).toContain("frame-ancestors 'none'");
  });
});

describe("cspMetaPlugin", () => {
  it("declares build-only apply mode and post ordering", () => {
    const plugin = cspMetaPlugin();
    expect(plugin.name).toBe("shaderplayground-csp-meta");
    expect(plugin.apply).toBe("build");
    const hook = plugin.transformIndexHtml;
    expect(hook).toBeDefined();
    if (hook && typeof hook !== "function" && "handler" in hook) {
      expect(hook.order).toBe("post");
      expect(typeof hook.handler).toBe("function");
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "../core/graph/types";
import { tokens } from "../theme";
import { buildExportedHtml, downloadExportedHtml } from "./htmlExport";

const sample: Graph = {
  nodes: [
    {
      id: "s1",
      kind: "shader",
      vertexSource: "void main(){ gl_Position = vec4(0); }",
      fragmentSource:
        "#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){ c = vec4(1); }",
      uniformValues: { u_x: 0.5 },
    },
    { id: "o1", kind: "output" },
  ],
  edges: [
    {
      id: "e1",
      source: "s1",
      sourceHandle: "texture",
      target: "o1",
      targetHandle: "texture",
    },
  ],
};

describe("buildExportedHtml", () => {
  it("embeds the project JSON", () => {
    const html = buildExportedHtml(sample, {});
    expect(html).toContain("window.__SP_PROJECT");
    expect(html).toContain('"id":"s1"');
    expect(html).toContain('"kind":"output"');
  });

  it("embeds group nodes verbatim — standalonePlayer ignores them at runtime", () => {
    // The static export's mini-runtime only branches on kinds 'shader' /
    // 'mesh' / 'webcam' / 'video' / 'audio' / 'param' / 'output'. Group nodes
    // pass straight through serializeProject and are never matched by any
    // filter inside standalonePlayer.js, so embedding them is a no-op.
    const withGroup: Graph = {
      nodes: [
        ...sample.nodes,
        {
          id: "g1",
          kind: "group",
          label: "Section",
          width: 300,
          height: 200,
        },
      ],
      edges: sample.edges,
    };
    const html = buildExportedHtml(withGroup, {});
    // Group is part of the embedded project so deserialization survives.
    expect(html).toContain('"kind":"group"');
    // None of standalonePlayer's filters select 'group' — confirm the literal
    // doesn't appear in the player source (a regression check against
    // future edits that might accidentally pull groups into the render path).
    const playerScript = html.split("window.__SP_PROJECT")[0] ?? "";
    expect(playerScript).not.toMatch(/kind\s*===\s*['"]group['"]/);
  });

  it("escapes every < in shader source, incl. whitespace </script variants (M9)", () => {
    const sneaky: Graph = {
      nodes: [
        {
          id: "x",
          kind: "shader",
          vertexSource: "void main(){}",
          // The HTML parser ends an inline script on </script followed by ANY
          // of >, whitespace, /, or newline — all must be neutralised.
          fragmentSource:
            "// </script><s>a</s> </script ><img src=x onerror=alert(1)> </script\n<!-- x -->",
          uniformValues: {},
        },
      ],
      edges: [],
    };
    const html = buildExportedHtml(sneaky, {});
    // Isolate the injected project literal: `window.__SP_PROJECT = {...};`.
    const projectLine = html
      .split("window.__SP_PROJECT = ")[1]
      ?.split("</script>")[0];
    expect(projectLine).toBeTruthy();
    // No raw `<` may survive in the embedded JSON — every one is <-escaped.
    expect(projectLine).not.toContain("<");
    expect(projectLine).toContain("\\u003c/script");
    expect(projectLine).toContain("\\u003c!--");
    // And the document as a whole never contains a real breakout sequence.
    expect(html).not.toContain("</script><s>");
    expect(html).not.toContain("</script >");
  });

  it("inlines a non-trivial standalone player script", () => {
    const html = buildExportedHtml(sample, {});
    // The player references its public API contract — check a few unique
    // strings that prove the runtime body was inlined.
    expect(html).toContain("__SP_PROJECT");
    expect(html).toContain("requestAnimationFrame");
    expect(html).toContain("webgl2");
    expect(html.length).toBeGreaterThan(8_000);
  });

  it("emits a valid HTML5 doctype + canvas", () => {
    const html = buildExportedHtml(sample, {});
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<canvas id="canvas"');
  });

  it("transplants app tokens into the exported stylesheet (D5)", () => {
    const html = buildExportedHtml(sample, {});
    const style = html.split("<style>")[1]?.split("</style>")[0] ?? "";
    expect(style).toContain(tokens.surface.app);
    expect(style).toContain(tokens.text.primary);
    expect(style).toContain(tokens.surface.letterbox);
    expect(style).toContain(tokens.overlay.scrim);
    expect(style).not.toContain("#111");
    expect(style).not.toContain("#ddd");
  });

  it("respects the title/width/height options", () => {
    const html = buildExportedHtml(
      sample,
      {},
      {
        title: "Custom & <Title>",
        width: 1024,
        height: 768,
      },
    );
    // Title is HTML-escaped.
    expect(html).toContain("<title>Custom &amp; &lt;Title&gt;</title>");
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="768"');
  });
});

/**
 * standalonePlayer.js is a standalone ES5 runtime with no module surface — it
 * cannot be imported and exercised the way the app's twin (`execute.ts`) is.
 * These guards pin the three frame-loop invariants that must stay in sync with
 * the app, asserted against the inlined player text the export actually ships.
 */
describe("standalone player frame-loop invariants", () => {
  // The whole document, not a prefix: the player itself reads
  // `window.__SP_PROJECT` well before its frame loop, so splitting on that
  // marker would silently cut away everything under test.
  const playerSource = (): string => buildExportedHtml(sample, {});

  it("binds u_camera on non-fullscreen passes, like execute.ts does (#27)", () => {
    // Without it, any lighting model reading the view vector renders black in
    // the export while looking correct in the editor.
    const src = playerSource();
    expect(src).toContain('setUniform(u["u_camera"], eye)');
    // …and only inside the non-fullscreen branch, next to the other matrices.
    const viewIdx = src.indexOf('setUniform(u["u_view"], view)');
    const camIdx = src.indexOf('setUniform(u["u_camera"], eye)');
    expect(viewIdx).toBeGreaterThan(-1);
    expect(camIdx).toBeGreaterThan(viewIdx);
  });

  it("bounds the composite loop by the cell count, not the output count (#28)", () => {
    // splitLayout tops out at 4 cells (see splitLayout.test.ts), so a graph
    // with 5+ connected outputs used to read cells[4] === undefined and throw
    // on `c.x` every single frame.
    const src = playerSource();
    expect(src).toContain("Math.min(drawable.length, cells.length)");
    expect(src).not.toMatch(/i\s*<\s*drawable\.length\s*;\s*i\+\+/);
  });

  it("evaluates resize() unconditionally every frame (#29)", () => {
    // `sizeDirty || resize()` short-circuits on exactly the frame after a
    // window resize, so the drawing buffer stays stale while resizePasses()
    // sizes the FBOs from it.
    const src = playerSource();
    expect(src).not.toContain("sizeDirty || resize()");
    expect(src).toMatch(/var resized = resize\(\)\s*;/);
    expect(src).toContain("if (sizeDirty || resized)");
  });
});

describe("downloadExportedHtml", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom omits URL.createObjectURL / revokeObjectURL — stub them so the
    // helper can run end-to-end.
    (
      URL as unknown as {
        createObjectURL: (b: Blob) => string;
        revokeObjectURL: (u: string) => void;
      }
    ).createObjectURL = vi.fn(() => "blob:fake-url");
    (
      URL as unknown as { revokeObjectURL: (u: string) => void }
    ).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an <a> with a blob URL, clicks it, and revokes the URL after a delay", () => {
    const clickSpy = vi.fn();
    // Intercept anchors so we can observe what was clicked without actually
    // navigating, and capture the download name that was actually set.
    let capturedDownload: string | undefined;
    const origCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "a") {
          (el as HTMLAnchorElement).click = clickSpy;
          Object.defineProperty(el, "download", {
            get: () => capturedDownload,
            set: (v: string) => {
              capturedDownload = v;
            },
          });
        }
        return el;
      });

    const returned = downloadExportedHtml(sample, {}, "my-project");

    // [D16] displayed name = actually-saved name — this is the return-value/
    // a.download equality this test exists to pin down.
    expect(returned).toMatch(/^my-project-\d{8}-\d{4}\.html$/);
    expect(capturedDownload).toBe(returned);

    expect(
      (URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> })
        .createObjectURL,
    ).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // revokeObjectURL fires inside setTimeout(..., 1000).
    expect(
      (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> })
        .revokeObjectURL,
    ).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(
      (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> })
        .revokeObjectURL,
    ).toHaveBeenCalledWith("blob:fake-url");

    createSpy.mockRestore();
  });
});

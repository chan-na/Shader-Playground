import { describe, expect, it } from "vitest";
import { statusSummary } from "./statusSummary";

const base = {
  ready: false,
  contextUnavailable: false,
  nodeCount: 0,
  paneCount: 0,
  compileErrorCount: 0,
};

describe("statusSummary", () => {
  it("shows GL init when nothing is ready yet (cold start)", () => {
    expect(statusSummary(base)).toEqual({ text: "GL init", tone: "muted" });
  });

  it("shows GL ready for an empty graph once the renderer is ready", () => {
    expect(statusSummary({ ...base, ready: true })).toEqual({
      text: "GL ready",
      tone: "success",
    });
  });

  it("shows No render target when nodes exist but no pane is connected", () => {
    expect(
      statusSummary({ ...base, ready: true, nodeCount: 4, paneCount: 0 }),
    ).toEqual({ text: "No render target", tone: "warning" });
  });

  it("shows a singular error count", () => {
    expect(
      statusSummary({ ...base, ready: true, compileErrorCount: 1 }),
    ).toEqual({ text: "1 error", tone: "error" });
  });

  it("shows a pluralized error count", () => {
    expect(
      statusSummary({ ...base, ready: true, compileErrorCount: 3 }),
    ).toEqual({ text: "3 errors", tone: "error" });
  });

  it("shows WebGL2 unavailable when the GL context is unavailable", () => {
    expect(
      statusSummary({ ...base, ready: true, contextUnavailable: true }),
    ).toEqual({ text: "WebGL2 unavailable", tone: "error" });
  });

  it("prioritizes contextUnavailable over compile errors", () => {
    expect(
      statusSummary({
        ...base,
        ready: true,
        contextUnavailable: true,
        compileErrorCount: 5,
      }),
    ).toEqual({ text: "WebGL2 unavailable", tone: "error" });
  });

  it("prioritizes compile errors over no-render-target", () => {
    expect(
      statusSummary({
        ...base,
        ready: true,
        nodeCount: 4,
        paneCount: 0,
        compileErrorCount: 2,
      }),
    ).toEqual({ text: "2 errors", tone: "error" });
  });

  it("prioritizes no-render-target over plain ready", () => {
    expect(
      statusSummary({ ...base, ready: true, nodeCount: 1, paneCount: 0 }),
    ).toEqual({ text: "No render target", tone: "warning" });
  });

  it("does not show No render target once a pane exists", () => {
    expect(
      statusSummary({ ...base, ready: true, nodeCount: 4, paneCount: 1 }),
    ).toEqual({ text: "GL ready", tone: "success" });
  });
});

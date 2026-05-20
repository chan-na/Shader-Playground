import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsReport,
  type DiagnosticsReportInput,
} from "./diagnosticsReport";

const base: DiagnosticsReportInput = {
  timestamp: 0,
  userAgent: "TestAgent/1.0",
  screen: { width: 1920, height: 1080, dpr: 2 },
  glInfo: { renderer: "SwiftShader", version: "WebGL 2.0" },
  stats: { fps: 60, drawCalls: 3, renderTick: 42, errorCount: 1 },
  graph: { nodes: 5, edges: 4 },
  logText: "[ts] WARN gl: link failed",
};

describe("buildDiagnosticsReport", () => {
  it("includes env, GL, graph, render stats and the log text", () => {
    const report = buildDiagnosticsReport(base);
    expect(report).toContain("TestAgent/1.0");
    expect(report).toContain("1920x1080 @ 2x");
    expect(report).toContain("GL renderer: SwiftShader");
    expect(report).toContain("GL version: WebGL 2.0");
    expect(report).toContain("graph: 5 nodes, 4 edges");
    expect(report).toContain("60 fps, 3 draws, renderTick 42, 1 errors");
    expect(report).toContain("[ts] WARN gl: link failed");
  });

  it("falls back to 'unknown' when glInfo is null", () => {
    const report = buildDiagnosticsReport({ ...base, glInfo: null });
    expect(report).toContain("GL renderer: unknown");
    expect(report).toContain("GL version: unknown");
  });

  it("shows '(empty)' when there are no log entries", () => {
    const report = buildDiagnosticsReport({ ...base, logText: "" });
    expect(report).toContain("--- log ---\n(empty)");
  });
});

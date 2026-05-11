import { describe, expect, it } from "vitest";
import { parseShaderInfoLog } from "./diagnostics";

describe("parseShaderInfoLog", () => {
  it('parses standard "ERROR: 0:line:" format', () => {
    const log = `ERROR: 0:12: 'u_foo' : undeclared identifier`;
    const d = parseShaderInfoLog(log);
    expect(d).toHaveLength(1);
    expect(d[0]!.line).toBe(12);
    expect(d[0]!.severity).toBe("error");
    expect(d[0]!.message).toContain("undeclared identifier");
  });

  it('parses "ERROR: 0:line:column:" format', () => {
    const log = `ERROR: 0:12:5: syntax error`;
    const d = parseShaderInfoLog(log);
    expect(d[0]!.line).toBe(12);
    expect(d[0]!.column).toBe(5);
  });

  it('parses NVIDIA-style "0(line):" format', () => {
    const log = `0(7) : error C0000: syntax error`;
    const d = parseShaderInfoLog(log);
    expect(d[0]!.line).toBe(7);
    expect(d[0]!.severity).toBe("error");
  });

  it("parses warnings", () => {
    const log = `WARNING: 0:3: implicit cast`;
    const d = parseShaderInfoLog(log);
    expect(d[0]!.severity).toBe("warning");
  });

  it("handles empty input", () => {
    expect(parseShaderInfoLog("")).toEqual([]);
  });

  it("parses multi-line logs", () => {
    const log = `ERROR: 0:1: x\nERROR: 0:5: y\n`;
    const d = parseShaderInfoLog(log);
    expect(d.map((x) => x.line)).toEqual([1, 5]);
  });

  it("falls back to line 1 for unknown format", () => {
    const log = `Random unparseable error text`;
    const d = parseShaderInfoLog(log);
    expect(d).toHaveLength(1);
    expect(d[0]!.line).toBe(1);
    expect(d[0]!.message).toContain("Random");
  });
});

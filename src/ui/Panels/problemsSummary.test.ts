import { describe, expect, it } from "vitest";
import { summarizeProblems } from "./problemsSummary";

describe("summarizeProblems", () => {
  it("counts a mix of severities", () => {
    const summary = summarizeProblems(
      [
        { severity: "error" },
        { severity: "warning" },
        { severity: "warning" },
        { severity: "info" },
      ],
      0,
    );
    expect(summary).toEqual({ error: 1, warning: 2, info: 1 });
  });

  it("folds runtimeErrorCount into the error bucket", () => {
    const summary = summarizeProblems(
      [{ severity: "warning" }, { severity: "error" }],
      3,
    );
    expect(summary).toEqual({ error: 4, warning: 1, info: 0 });
  });

  it("returns all zeros for empty input and no runtime errors", () => {
    expect(summarizeProblems([], 0)).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("counts only runtime errors when there are no diagnostic entries", () => {
    expect(summarizeProblems([], 2)).toEqual({ error: 2, warning: 0, info: 0 });
  });
});

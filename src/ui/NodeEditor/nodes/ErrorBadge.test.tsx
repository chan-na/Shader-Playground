import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GLSLDiagnostic } from "../../../core/graph/diagnostics";
import {
  emptyDiagnostics,
  useDiagnosticsStore,
} from "../../../state/diagnosticsStore";
import { countNodeDiagnostics, ErrorBadge } from "./ErrorBadge";

const mkDiag = (line: number): GLSLDiagnostic => ({
  line,
  message: "boom",
  severity: "error",
});

afterEach(() => {
  cleanup();
  useDiagnosticsStore.setState({ byNode: {} });
});

describe("countNodeDiagnostics", () => {
  it("returns 0 for undefined (node never recorded any diagnostics)", () => {
    expect(countNodeDiagnostics(undefined)).toBe(0);
  });

  it("sums vertex + fragment + link array lengths", () => {
    const d = emptyDiagnostics();
    d.vertex.push(mkDiag(1));
    d.fragment.push(mkDiag(2), mkDiag(3));
    d.link.push(mkDiag(4));
    expect(countNodeDiagnostics(d)).toBe(4);
  });

  it("returns 0 when every stage's array is empty", () => {
    expect(countNodeDiagnostics(emptyDiagnostics())).toBe(0);
  });
});

describe("ErrorBadge", () => {
  it("renders nothing when the node has no diagnostics", () => {
    render(<ErrorBadge nodeId="s1" />);
    expect(screen.queryByTestId("node-errors-s1")).toBeNull();
  });

  it("renders the ✕ N pill once diagnostics are set for the node", () => {
    const d = emptyDiagnostics();
    d.fragment.push(mkDiag(5), mkDiag(6));
    useDiagnosticsStore.getState().set("s1", d);

    render(<ErrorBadge nodeId="s1" />);
    const badge = screen.getByTestId("node-errors-s1");
    expect(badge.textContent).toBe("✕ 2");
  });

  it("only renders the badge for the node it was given, not other nodes", () => {
    useDiagnosticsStore.getState().set("s1", emptyDiagnostics());
    const d2 = emptyDiagnostics();
    d2.vertex.push(mkDiag(1));
    useDiagnosticsStore.getState().set("s2", d2);

    render(<ErrorBadge nodeId="s1" />);
    expect(screen.queryByTestId("node-errors-s1")).toBeNull();
  });
});

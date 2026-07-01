import { beforeEach, describe, expect, it } from "vitest";
import type { GLSLDiagnostic } from "../core/graph/diagnostics";
import { emptyDiagnostics, useDiagnosticsStore } from "./diagnosticsStore";

const mkDiag = (line: number, msg = "boom"): GLSLDiagnostic => ({
  line,
  message: msg,
  severity: "error",
});

describe("diagnosticsStore", () => {
  beforeEach(() => {
    useDiagnosticsStore.setState({ byNode: {} });
  });

  it("emptyDiagnostics returns an empty bag for each stage", () => {
    const d = emptyDiagnostics();
    expect(d.vertex).toEqual([]);
    expect(d.fragment).toEqual([]);
    expect(d.link).toEqual([]);
  });

  it("set stores diagnostics keyed by nodeId", () => {
    const d = emptyDiagnostics();
    d.fragment.push(mkDiag(12, "syntax"));
    useDiagnosticsStore.getState().set("n1", d);
    expect(useDiagnosticsStore.getState().byNode.n1?.fragment).toHaveLength(1);
    expect(useDiagnosticsStore.getState().byNode.n1?.fragment[0]?.line).toBe(
      12,
    );
  });

  it("set overwrites previous diagnostics for the same node", () => {
    const d1 = emptyDiagnostics();
    d1.vertex.push(mkDiag(1));
    const d2 = emptyDiagnostics();
    d2.fragment.push(mkDiag(2));
    useDiagnosticsStore.getState().set("n1", d1);
    useDiagnosticsStore.getState().set("n1", d2);
    const stored = useDiagnosticsStore.getState().byNode.n1;
    expect(stored?.vertex).toEqual([]);
    expect(stored?.fragment).toHaveLength(1);
  });

  it("clear removes only the targeted node", () => {
    const d = emptyDiagnostics();
    useDiagnosticsStore.getState().set("n1", d);
    useDiagnosticsStore.getState().set("n2", d);
    useDiagnosticsStore.getState().clear("n1");
    const s = useDiagnosticsStore.getState().byNode;
    expect(s.n1).toBeUndefined();
    expect(s.n2).toBeDefined();
  });

  it("reset wipes the whole map", () => {
    useDiagnosticsStore.getState().set("n1", emptyDiagnostics());
    useDiagnosticsStore.getState().set("n2", emptyDiagnostics());
    useDiagnosticsStore.getState().reset();
    expect(useDiagnosticsStore.getState().byNode).toEqual({});
  });

  it("retainOnly drops entries for nodes that no longer exist (M10)", () => {
    const d = emptyDiagnostics();
    useDiagnosticsStore.getState().set("live", d);
    useDiagnosticsStore.getState().set("deleted", d);
    useDiagnosticsStore.getState().retainOnly(["live"]);
    const s = useDiagnosticsStore.getState().byNode;
    expect(Object.keys(s)).toEqual(["live"]);
    expect(s.deleted).toBeUndefined();
  });

  it("retainOnly preserves object identity when nothing is pruned (M10)", () => {
    useDiagnosticsStore.getState().set("a", emptyDiagnostics());
    const before = useDiagnosticsStore.getState().byNode;
    useDiagnosticsStore.getState().retainOnly(["a", "not-present"]);
    // No key was removed, so subscribers must not see a new byNode reference.
    expect(useDiagnosticsStore.getState().byNode).toBe(before);
  });
});

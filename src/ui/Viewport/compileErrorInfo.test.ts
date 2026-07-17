import { describe, expect, it } from "vitest";
import type { GraphNode } from "../../core/graph/types";
import {
  emptyDiagnostics,
  type NodeDiagnostics,
} from "../../state/diagnosticsStore";
import { firstCompileError } from "./compileErrorInfo";

function shaderNode(
  id: string,
  overrides: Partial<{ vertexSource: string; fragmentSource: string }> = {},
): GraphNode {
  return {
    id,
    kind: "shader",
    vertexSource: overrides.vertexSource ?? "void main() {}",
    fragmentSource: overrides.fragmentSource ?? "void main() {}",
    uniformValues: {},
  };
}

describe("firstCompileError", () => {
  it("returns null when no node has an error-severity diagnostic", () => {
    const nodes = [shaderNode("s1")];
    expect(firstCompileError({}, nodes)).toBeNull();

    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "warning", message: "unused" }],
      },
    };
    expect(firstCompileError(byNode, nodes)).toBeNull();
  });

  it("returns fragment-stage info with a 4-line excerpt window, clamped at file boundaries", () => {
    const frag = ["line1", "line2", "line3", "line4", "line5", "line6"].join(
      "\n",
    );
    const nodes = [shaderNode("s1", { fragmentSource: frag })];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 4, severity: "error", message: "boom" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info).not.toBeNull();
    expect(info?.nodeId).toBe("s1");
    expect(info?.title).toBe("shader · s1");
    expect(info?.stage).toBe("fragment");
    expect(info?.line).toBe(4);
    expect(info?.message).toBe("boom");
    expect(info?.errorCount).toBe(1);
    expect(info?.excerpt).toEqual([
      { lineNo: 2, text: "line2", isError: false },
      { lineNo: 3, text: "line3", isError: false },
      { lineNo: 4, text: "line4", isError: true },
      { lineNo: 5, text: "line5", isError: false },
    ]);

    // Boundary clamp: error on line 1 has no line-2/line-1, so the window
    // starts at 1 instead of going negative.
    const edgeByNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "error", message: "boom" }],
      },
    };
    const edgeInfo = firstCompileError(edgeByNode, nodes);
    expect(edgeInfo?.excerpt).toEqual([
      { lineNo: 1, text: "line1", isError: true },
      { lineNo: 2, text: "line2", isError: false },
    ]);
  });

  it("prefers a vertex-stage error over a fragment-stage error on the same node", () => {
    const nodes = [shaderNode("s1")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        vertex: [{ line: 2, severity: "error", message: "vertex boom" }],
        fragment: [{ line: 3, severity: "error", message: "fragment boom" }],
        link: [],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.stage).toBe("vertex");
    expect(info?.line).toBe(2);
    expect(info?.message).toBe("vertex boom");
    // errorCount sums across every stage of the node, not just the picked one.
    expect(info?.errorCount).toBe(2);
  });

  it("builds the vertex excerpt from the source that was actually compiled", () => {
    // A shader node with no mesh input compiles as a fullscreen pass, so the
    // driver's line numbers index fullscreen.vert — not node.vertexSource.
    // Reading the node here would quote unrelated lines from a file the
    // compiler never saw.
    const authored = ["auth1", "auth2", "auth3", "auth4"].join("\n");
    const compiled = ["fs1", "fs2", "fs3", "fs4"].join("\n");
    const nodes = [shaderNode("s1", { vertexSource: authored })];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        vertex: [{ line: 3, severity: "error", message: "boom" }],
        compiledVertexSource: compiled,
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.stage).toBe("vertex");
    expect(info?.excerpt).toEqual([
      { lineNo: 1, text: "fs1", isError: false },
      { lineNo: 2, text: "fs2", isError: false },
      { lineNo: 3, text: "fs3", isError: true },
      { lineNo: 4, text: "fs4", isError: false },
    ]);
  });

  it("falls back to the node's vertex source when no compiled source was recorded", () => {
    const authored = ["auth1", "auth2", "auth3"].join("\n");
    const nodes = [shaderNode("s1", { vertexSource: authored })];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        vertex: [{ line: 2, severity: "error", message: "boom" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.excerpt).toEqual([
      { lineNo: 1, text: "auth1", isError: false },
      { lineNo: 2, text: "auth2", isError: true },
      { lineNo: 3, text: "auth3", isError: false },
    ]);
  });

  it("treats a link-stage error as lineless: line null and an empty excerpt", () => {
    const nodes = [shaderNode("s1")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        link: [{ line: 1, severity: "error", message: "link failed" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.stage).toBe("link");
    expect(info?.line).toBeNull();
    expect(info?.excerpt).toEqual([]);
    expect(info?.message).toBe("link failed");
  });

  it("skips a node whose diagnostics are all warnings", () => {
    const nodes = [shaderNode("s1"), shaderNode("s2")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "warning", message: "careful" }],
      },
      s2: {
        ...emptyDiagnostics(),
        fragment: [{ line: 2, severity: "error", message: "real error" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.nodeId).toBe("s2");
    expect(info?.message).toBe("real error");
  });

  it("reports failingNodeCount 1 for a single failing shader node [D19]", () => {
    const nodes = [shaderNode("s1")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "error", message: "boom" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.failingNodeCount).toBe(1);
  });

  it("counts every failing shader node while still returning the first one, excluding warning-only nodes [D19]", () => {
    const nodes = [shaderNode("s1"), shaderNode("s2"), shaderNode("s3")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "error", message: "s1 boom" }],
      },
      s2: {
        ...emptyDiagnostics(),
        fragment: [{ line: 2, severity: "error", message: "s2 boom" }],
      },
      s3: {
        ...emptyDiagnostics(),
        fragment: [{ line: 3, severity: "warning", message: "s3 careful" }],
      },
    };

    const info = firstCompileError(byNode, nodes);
    expect(info?.nodeId).toBe("s1");
    expect(info?.failingNodeCount).toBe(2);
  });
});

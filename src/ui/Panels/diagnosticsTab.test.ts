import { describe, expect, it } from "vitest";
import type {
  ComputeGraphNode,
  MeshGraphNode,
  ShaderGraphNode,
} from "../../core/graph/types";
import {
  emptyDiagnostics,
  type NodeDiagnostics,
} from "../../state/diagnosticsStore";
import {
  frameMetricValue,
  linkedProgramsValue,
  relativeLogTime,
} from "./diagnosticsTab";

function shaderNode(id: string): ShaderGraphNode {
  return {
    id,
    kind: "shader",
    vertexSource: "",
    fragmentSource: "",
    uniformValues: {},
  };
}

function computeNode(id: string): ComputeGraphNode {
  return {
    id,
    kind: "compute",
    vertexSource: "",
    count: 1,
    primitive: "POINTS",
    attributes: [],
    uniformValues: {},
  };
}

function meshNode(id: string): MeshGraphNode {
  return { id, kind: "mesh", primitive: "cube" };
}

describe("frameMetricValue", () => {
  it("returns an em dash when fps is 0 (no frames yet)", () => {
    expect(frameMetricValue(0)).toBe("—");
  });

  it("formats ms and fps together", () => {
    expect(frameMetricValue(60)).toBe("16.7 ms · 60 fps");
  });
});

describe("linkedProgramsValue", () => {
  it("reports 0 compiled when there are no shader/compute nodes", () => {
    expect(linkedProgramsValue([meshNode("m1")], {})).toBe("0 compiled");
  });

  it("counts shader nodes with an error diagnostic as not compiled", () => {
    const nodes = [shaderNode("s1"), shaderNode("s2")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        fragment: [{ line: 1, severity: "error", message: "boom" }],
      },
    };
    expect(linkedProgramsValue(nodes, byNode)).toBe("1 compiled");
  });

  it("still counts a node with only warnings as compiled", () => {
    const nodes = [shaderNode("s1")];
    const byNode: Record<string, NodeDiagnostics> = {
      s1: {
        ...emptyDiagnostics(),
        vertex: [{ line: 2, severity: "warning", message: "meh" }],
      },
    };
    expect(linkedProgramsValue(nodes, byNode)).toBe("1 compiled");
  });

  it("includes compute nodes in the program count", () => {
    const nodes = [shaderNode("s1"), computeNode("c1")];
    expect(linkedProgramsValue(nodes, {})).toBe("2 compiled");
  });
});

describe("relativeLogTime", () => {
  it("formats elapsed seconds relative to the buffer's first entry", () => {
    expect(relativeLogTime(1500, 1000)).toBe("0.5s");
  });

  it("clamps negative deltas (out-of-order timestamps) to 0.0s", () => {
    expect(relativeLogTime(500, 1000)).toBe("0.0s");
  });
});

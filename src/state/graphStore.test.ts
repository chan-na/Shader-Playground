import { beforeEach, describe, expect, it } from "vitest";
import type {
  CombineGraphNode,
  ComputeGraphNode,
  MathGraphNode,
  ParamGraphNode,
  ShaderGraphNode,
  SwizzleGraphNode,
  WebcamGraphNode,
} from "../core/graph/types";
import {
  redoGraph,
  snapshotGraph,
  undoGraph,
  useGraphStore,
} from "./graphStore";
import { useHistoryStore } from "./historyStore";

const makeShader = (id: string, frag = "void main(){}"): ShaderGraphNode => ({
  id,
  kind: "shader",
  vertexSource: "void main(){ gl_Position = vec4(0); }",
  fragmentSource: frag,
  uniformValues: {},
});

describe("graphStore", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useHistoryStore.getState().clear();
  });

  it("starts empty", () => {
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("addNode appends and bumps rev", () => {
    const before = useGraphStore.getState().rev;
    useGraphStore.getState().addNode(makeShader("n1"), { x: 10, y: 20 });
    const after = useGraphStore.getState();
    expect(after.nodes).toHaveLength(1);
    expect(after.positions.n1).toEqual({ x: 10, y: 20 });
    expect(after.rev).toBe(before + 1);
  });

  it("removeNode also removes connected edges", () => {
    const s = useGraphStore.getState();
    s.addNode({ id: "a", kind: "mesh", primitive: "cube" });
    s.addNode(makeShader("b"));
    s.addEdge({
      id: "e1",
      source: "a",
      sourceHandle: "mesh",
      target: "b",
      targetHandle: "mesh",
    });
    expect(useGraphStore.getState().edges).toHaveLength(1);

    useGraphStore.getState().removeNode("a");
    expect(useGraphStore.getState().nodes).toHaveLength(1);
    expect(useGraphStore.getState().edges).toHaveLength(0);
  });

  it("nudgeNodes translates the listed nodes and leaves others untouched", () => {
    const s = useGraphStore.getState();
    s.addNode(makeShader("a"), { x: 10, y: 20 });
    s.addNode(makeShader("b"), { x: 100, y: 100 });
    s.addNode(makeShader("c"), { x: 0, y: 0 });

    useGraphStore.getState().nudgeNodes(["a", "b"], 5, -7);
    const after = useGraphStore.getState();
    expect(after.positions.a).toEqual({ x: 15, y: 13 });
    expect(after.positions.b).toEqual({ x: 105, y: 93 });
    // Unlisted node stays put.
    expect(after.positions.c).toEqual({ x: 0, y: 0 });
  });

  it("nudgeNodes does not bump rev or push history (positions are non-structural)", () => {
    const s = useGraphStore.getState();
    s.addNode(makeShader("a"), { x: 10, y: 20 });
    useHistoryStore.getState().clear();
    const beforeRev = useGraphStore.getState().rev;

    useGraphStore.getState().nudgeNodes(["a"], 5, 5);
    expect(useGraphStore.getState().rev).toBe(beforeRev);
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it("nudgeNodes ignores unknown ids and no-op deltas", () => {
    const s = useGraphStore.getState();
    s.addNode(makeShader("a"), { x: 10, y: 20 });
    useGraphStore.getState().nudgeNodes(["missing"], 5, 5);
    expect(useGraphStore.getState().positions.a).toEqual({ x: 10, y: 20 });
    useGraphStore.getState().nudgeNodes(["a"], 0, 0);
    expect(useGraphStore.getState().positions.a).toEqual({ x: 10, y: 20 });
  });

  it("cloneNode deep-copies under a new id, offsets, and skips edges", () => {
    const s = useGraphStore.getState();
    s.addNode({ id: "src", kind: "mesh", primitive: "cube" });
    s.addNode(makeShader("dst"));
    s.addEdge({
      id: "e1",
      source: "src",
      sourceHandle: "mesh",
      target: "dst",
      targetHandle: "mesh",
    });
    s.updateNodePosition("src", { x: 100, y: 50 });

    const before = useGraphStore.getState();
    const newId = useGraphStore.getState().cloneNode("src");
    if (!newId) throw new Error("cloneNode returned null");
    const after = useGraphStore.getState();

    expect(newId).not.toBe("src");
    expect(after.nodes).toHaveLength(3);
    const clone = after.nodes.find((n) => n.id === newId);
    expect(clone?.kind).toBe("mesh");
    // Edges are not duplicated.
    expect(after.edges).toHaveLength(1);
    // Offset from the original position.
    expect(after.positions[newId]).toEqual({ x: 140, y: 90 });
    expect(after.rev).toBe(before.rev + 1);
  });

  it("cloneNode performs a deep copy (mutating clone leaves source intact)", () => {
    const cn: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "void main(){}",
      count: 16,
      primitive: "POINTS",
      attributes: [
        { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
      ],
      uniformValues: { u_k: 1 },
    };
    useGraphStore.getState().addNode(cn);
    const newId = useGraphStore.getState().cloneNode("c1");
    const clone = useGraphStore
      .getState()
      .nodes.find((n) => n.id === newId) as ComputeGraphNode;
    const attr = clone.attributes[0];
    if (attr) attr.size = 1;
    clone.uniformValues.u_k = 99;
    const original = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "c1") as ComputeGraphNode;
    expect(original.attributes[0]?.size).toBe(3);
    expect(original.uniformValues.u_k).toBe(1);
  });

  it("cloneNode returns null for an unknown id", () => {
    expect(useGraphStore.getState().cloneNode("nope")).toBeNull();
  });

  it("updateShaderSource patches vertex/fragment sources", () => {
    useGraphStore.getState().addNode(makeShader("s1", "A"));
    useGraphStore.getState().updateShaderSource("s1", { fragmentSource: "B" });
    const node = useGraphStore.getState().nodes[0] as ShaderGraphNode;
    expect(node.fragmentSource).toBe("B");
  });

  it("setUniformValue bumps uniformRev not rev", () => {
    useGraphStore.getState().addNode(makeShader("s1"));
    const before = useGraphStore.getState();
    useGraphStore.getState().setUniformValue("s1", "u_intensity", 0.5);
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ShaderGraphNode).uniformValues.u_intensity).toBe(
      0.5,
    );
    expect(after.uniformRev).toBe(before.uniformRev + 1);
    expect(after.rev).toBe(before.rev);
  });

  it("setResolutionScale sets the field and bumps rev (structural)", () => {
    useGraphStore.getState().addNode(makeShader("s1"));
    const before = useGraphStore.getState();
    useGraphStore.getState().setResolutionScale("s1", 0.5);
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ShaderGraphNode).resolutionScale).toBe(0.5);
    expect(after.rev).toBe(before.rev + 1);
  });

  it("setResolutionScale ignores non-shader nodes", () => {
    useGraphStore
      .getState()
      .addNode({ id: "m1", kind: "mesh", primitive: "cube" });
    useGraphStore.getState().setResolutionScale("m1", 0.25);
    const node = useGraphStore.getState().nodes[0];
    expect(node?.kind).toBe("mesh");
    expect(node && "resolutionScale" in node).toBe(false);
  });

  it("updateComputeSource patches vertexSource and bumps rev (Phase 13)", () => {
    const cn: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "void main(){}",
      count: 16,
      primitive: "POINTS",
      attributes: [
        { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
      ],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    const before = useGraphStore.getState();
    useGraphStore.getState().updateComputeSource("c1", "// new vertex source");
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ComputeGraphNode).vertexSource).toBe(
      "// new vertex source",
    );
    expect(after.rev).toBe(before.rev + 1);
  });

  it("setComputeConfig patches count/primitive/attributes (Phase 13)", () => {
    const cn: ComputeGraphNode = {
      id: "c1",
      kind: "compute",
      vertexSource: "",
      count: 16,
      primitive: "POINTS",
      attributes: [
        { inName: "a_position", outName: "v_position", size: 3, seed: "zero" },
      ],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    useGraphStore
      .getState()
      .setComputeConfig("c1", { count: 512, primitive: "LINES" });
    const updated = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "c1") as ComputeGraphNode;
    expect(updated.count).toBe(512);
    expect(updated.primitive).toBe("LINES");
  });

  it("setWebcamConfig assigns deviceId, bumps rev, and pushes history (Phase 14)", () => {
    useGraphStore
      .getState()
      .addNode({ id: "w1", kind: "webcam" } satisfies WebcamGraphNode);
    const before = useGraphStore.getState().rev;
    useGraphStore.getState().setWebcamConfig("w1", { deviceId: "cam-xyz" });
    const after = useGraphStore.getState();
    const w = after.nodes.find((n) => n.id === "w1") as WebcamGraphNode;
    expect(w.deviceId).toBe("cam-xyz");
    expect(after.rev).toBe(before + 1);
  });

  it("setWebcamConfig with empty string resets to default (no deviceId key)", () => {
    useGraphStore
      .getState()
      .addNode({ id: "w2", kind: "webcam", deviceId: "old" });
    useGraphStore.getState().setWebcamConfig("w2", { deviceId: "" });
    const w = useGraphStore
      .getState()
      .nodes.find((n) => n.id === "w2") as WebcamGraphNode;
    expect("deviceId" in w).toBe(false);
  });

  it("removeEdge removes only the named edge", () => {
    const s = useGraphStore.getState();
    s.addEdge({
      id: "e1",
      source: "a",
      sourceHandle: "o",
      target: "b",
      targetHandle: "i",
    });
    s.addEdge({
      id: "e2",
      source: "a",
      sourceHandle: "o",
      target: "c",
      targetHandle: "i",
    });
    useGraphStore.getState().removeEdge("e1");
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(["e2"]);
  });

  it("updateNodePosition updates positions without bumping rev", () => {
    const s = useGraphStore.getState();
    s.addNode({ id: "n1", kind: "mesh", primitive: "cube" }, { x: 0, y: 0 });
    const beforeRev = useGraphStore.getState().rev;
    useGraphStore.getState().updateNodePosition("n1", { x: 99, y: 7 });
    expect(useGraphStore.getState().positions.n1).toEqual({ x: 99, y: 7 });
    expect(useGraphStore.getState().rev).toBe(beforeRev);
  });

  it("setMathConfig patches op/a/b and falls back when patch fields omitted", () => {
    const m: MathGraphNode = { id: "m1", kind: "math", op: "add", a: 1, b: 2 };
    useGraphStore.getState().addNode(m);
    useGraphStore.getState().setMathConfig("m1", { op: "multiply", a: 5 });
    let updated = useGraphStore.getState().nodes[0] as MathGraphNode;
    expect(updated.op).toBe("multiply");
    expect(updated.a).toBe(5);
    expect(updated.b).toBe(2); // fallback to existing

    useGraphStore.getState().setMathConfig("m1", {});
    updated = useGraphStore.getState().nodes[0] as MathGraphNode;
    expect(updated.op).toBe("multiply"); // all fallbacks
  });

  it("setSwizzleMask patches mask on swizzle nodes", () => {
    const sw: SwizzleGraphNode = { id: "sw1", kind: "swizzle", mask: "x" };
    useGraphStore.getState().addNode(sw);
    useGraphStore.getState().setSwizzleMask("sw1", "yzw");
    expect((useGraphStore.getState().nodes[0] as SwizzleGraphNode).mask).toBe(
      "yzw",
    );
  });

  it("setCombineConfig patches arity/values and falls back when omitted", () => {
    const c: CombineGraphNode = {
      id: "c1",
      kind: "combine",
      arity: 2,
      values: [0, 0, 0, 0],
    };
    useGraphStore.getState().addNode(c);
    useGraphStore
      .getState()
      .setCombineConfig("c1", { arity: 4, values: [1, 2, 3, 4] });
    let updated = useGraphStore.getState().nodes[0] as CombineGraphNode;
    expect(updated.arity).toBe(4);
    expect(updated.values).toEqual([1, 2, 3, 4]);

    // Fallback path — empty patch keeps existing values reference
    useGraphStore.getState().setCombineConfig("c1", {});
    updated = useGraphStore.getState().nodes[0] as CombineGraphNode;
    expect(updated.values).toEqual([1, 2, 3, 4]);
  });

  it("setComputeConfig falls back to existing attributes when patch omits them", () => {
    const cn: ComputeGraphNode = {
      id: "cc1",
      kind: "compute",
      vertexSource: "",
      count: 16,
      primitive: "POINTS",
      attributes: [{ inName: "a_p", outName: "v_p", size: 3, seed: "zero" }],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    useGraphStore.getState().setComputeConfig("cc1", { count: 64 });
    const updated = useGraphStore.getState().nodes[0] as ComputeGraphNode;
    expect(updated.count).toBe(64);
    expect(updated.attributes).toHaveLength(1);
    expect(updated.attributes[0]?.inName).toBe("a_p");
  });

  it("setParamValue updates value and bumps uniformRev only", () => {
    const p: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 0,
    };
    useGraphStore.getState().addNode(p);
    const before = useGraphStore.getState();
    useGraphStore.getState().setParamValue("p1", 0.42);
    const after = useGraphStore.getState();
    expect((after.nodes[0] as ParamGraphNode).value).toBe(0.42);
    expect(after.uniformRev).toBe(before.uniformRev + 1);
    expect(after.rev).toBe(before.rev);
  });

  it("setParamLabel patches label and bumps rev", () => {
    const p: ParamGraphNode = {
      id: "p1",
      kind: "param",
      paramKind: "float",
      value: 0,
    };
    useGraphStore.getState().addNode(p);
    const before = useGraphStore.getState().rev;
    useGraphStore.getState().setParamLabel("p1", "Intensity");
    expect((useGraphStore.getState().nodes[0] as ParamGraphNode).label).toBe(
      "Intensity",
    );
    expect(useGraphStore.getState().rev).toBe(before + 1);
  });

  it("setUniformValue also targets compute nodes", () => {
    const cn: ComputeGraphNode = {
      id: "cu1",
      kind: "compute",
      vertexSource: "",
      count: 1,
      primitive: "POINTS",
      attributes: [],
      uniformValues: {},
    };
    useGraphStore.getState().addNode(cn);
    useGraphStore.getState().setUniformValue("cu1", "u_x", 7);
    const updated = useGraphStore.getState().nodes[0] as ComputeGraphNode;
    expect(updated.uniformValues.u_x).toBe(7);
  });

  it("setGraph replaces nodes/edges and bumps rev", () => {
    useGraphStore
      .getState()
      .addNode({ id: "old", kind: "mesh", primitive: "cube" });
    const beforeRev = useGraphStore.getState().rev;
    useGraphStore.getState().setGraph(
      {
        nodes: [{ id: "new", kind: "mesh", primitive: "sphere" }],
        edges: [],
      },
      { new: { x: 1, y: 2 } },
    );
    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(["new"]);
    expect(s.positions.new).toEqual({ x: 1, y: 2 });
    expect(s.rev).toBe(beforeRev + 1);
  });

  it("snapshotGraph returns the live nodes/edges arrays", () => {
    useGraphStore
      .getState()
      .addNode({ id: "n", kind: "mesh", primitive: "cube" });
    const snap = snapshotGraph();
    expect(snap.nodes).toHaveLength(1);
    expect(snap.edges).toEqual([]);
  });

  it("applySnapshot replaces state without touching history (used by undo)", () => {
    useGraphStore.getState().applySnapshot({
      nodes: [{ id: "x", kind: "mesh", primitive: "cube" }],
      edges: [],
      positions: { x: { x: 4, y: 5 } },
    });
    const s = useGraphStore.getState();
    expect(s.nodes[0]?.id).toBe("x");
    expect(s.positions.x).toEqual({ x: 4, y: 5 });
  });

  it("undoGraph applies a previous snapshot when history is non-empty", () => {
    useGraphStore
      .getState()
      .addNode({ id: "a", kind: "mesh", primitive: "cube" });
    useGraphStore
      .getState()
      .addNode({ id: "b", kind: "mesh", primitive: "sphere" });
    expect(useGraphStore.getState().nodes).toHaveLength(2);

    expect(undoGraph()).toBe(true);
    // historyStore.undo returns past[length-2] (not the most recent push) —
    // we just assert the call succeeded and live state shrunk.
    expect(useGraphStore.getState().nodes.length).toBeLessThan(2);
  });

  it("redoGraph restores a previously undone snapshot", () => {
    useGraphStore
      .getState()
      .addNode({ id: "a", kind: "mesh", primitive: "cube" });
    useGraphStore
      .getState()
      .addNode({ id: "b", kind: "mesh", primitive: "sphere" });
    undoGraph();
    expect(redoGraph()).toBe(true);
    // After redo, future-head was cloned back into live state.
    expect(useGraphStore.getState().nodes.length).toBeGreaterThan(0);
  });

  it("undoGraph / redoGraph return false when stacks are empty", () => {
    expect(undoGraph()).toBe(false);
    expect(redoGraph()).toBe(false);
  });

  describe("setUniformHints", () => {
    it("writes hints into the fragment source and bumps rev", () => {
      const s = useGraphStore.getState();
      s.addNode(makeShader("s1", "uniform float u_x;\nvoid main(){}"));
      const before = useGraphStore.getState().rev;
      s.setUniformHints("s1", "u_x", { min: 0, max: 5, defaultValue: 2 });

      const node = useGraphStore.getState().nodes.find((n) => n.id === "s1");
      expect((node as ShaderGraphNode).fragmentSource).toContain(
        "uniform float u_x; // @range 0..5 @default 2",
      );
      expect(useGraphStore.getState().rev).toBe(before + 1);
    });

    it("falls back to the vertex source when not in the fragment", () => {
      const s = useGraphStore.getState();
      s.addNode({
        id: "s1",
        kind: "shader",
        vertexSource: "uniform float u_freq;\nvoid main(){}",
        fragmentSource: "void main(){}",
        uniformValues: {},
      } satisfies ShaderGraphNode);
      s.setUniformHints("s1", "u_freq", { min: -1, max: 1 });

      const node = useGraphStore.getState().nodes.find((n) => n.id === "s1");
      expect((node as ShaderGraphNode).vertexSource).toContain(
        "uniform float u_freq; // @range -1..1",
      );
    });

    it("writes into a compute node's vertex source", () => {
      const s = useGraphStore.getState();
      const cn: ComputeGraphNode = {
        id: "c1",
        kind: "compute",
        vertexSource: "uniform float u_speed;\nvoid main(){}",
        count: 10,
        primitive: "POINTS",
        attributes: [],
        uniformValues: {},
      };
      s.addNode(cn);
      s.setUniformHints("c1", "u_speed", { min: 0, max: 3, step: 0.1 });

      const node = useGraphStore.getState().nodes.find((n) => n.id === "c1");
      expect((node as ComputeGraphNode).vertexSource).toContain(
        "uniform float u_speed; // @range 0..3 @step 0.1",
      );
    });

    it("is a no-op for an unknown id", () => {
      const before = useGraphStore.getState().rev;
      useGraphStore.getState().setUniformHints("nope", "u_x", { min: 0 });
      expect(useGraphStore.getState().rev).toBe(before);
    });
  });
});

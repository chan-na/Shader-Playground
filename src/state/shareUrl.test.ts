import { describe, expect, it } from "vitest";
import type { Graph } from "../core/graph/types";
import { decodeShareHash, encodeShareUrl } from "./shareUrl";

const graph: Graph = {
  nodes: [
    { id: "mesh1", kind: "mesh", primitive: "sphere" },
    {
      id: "shader1",
      kind: "shader",
      vertexSource: "void main(){}",
      fragmentSource:
        "#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){ c = vec4(1); }",
      uniformValues: { u_baseColor: [0.5, 0.7, 1.0] },
    },
    { id: "output1", kind: "output" },
  ],
  edges: [
    {
      id: "e1",
      source: "mesh1",
      sourceHandle: "mesh",
      target: "shader1",
      targetHandle: "mesh",
    },
    {
      id: "e2",
      source: "shader1",
      sourceHandle: "texture",
      target: "output1",
      targetHandle: "texture",
    },
  ],
};

const positions = {
  mesh1: { x: 0, y: 0 },
  shader1: { x: 100, y: 0 },
  output1: { x: 200, y: 0 },
};

describe("shareUrl", () => {
  it("round-trips a project through encode/decode", async () => {
    const url = await encodeShareUrl(graph, positions, "http://example.com/");
    expect(url).toContain("#share=");
    const fragment = url.split("#")[1];
    const decoded = await decodeShareHash(`#${fragment}`);
    expect(decoded).not.toBeNull();
    expect(decoded?.graph.nodes.map((n) => n.id)).toEqual([
      "mesh1",
      "shader1",
      "output1",
    ]);
    expect(decoded?.graph.edges).toHaveLength(2);
    expect(decoded?.positions.shader1).toEqual({ x: 100, y: 0 });
  });

  it("returns null when no share fragment is present", async () => {
    expect(await decodeShareHash("")).toBeNull();
    expect(await decodeShareHash("#other")).toBeNull();
  });

  it("returns null on garbled payload", async () => {
    expect(await decodeShareHash("#share=NOT_VALID_BASE64!!!")).toBeNull();
  });

  it("produces a URL containing only URL-safe base64 chars", async () => {
    const url = await encodeShareUrl(graph, positions, "http://example.com/");
    const payload = url.split("#share=")[1];
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

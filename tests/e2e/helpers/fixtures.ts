import type { Page } from "@playwright/test";
import { waitForApp, waitForReady, withSp } from "./sp";
import type { GraphEdge, GraphNodeMinimal } from "./types";

/** Wait for the app boot + demo bootstrap to complete. */
export async function bootApp(page: Page): Promise<void> {
  await waitForApp(page);
  await waitForReady(page);
}

/** Replace the graph wholesale with a fixture. */
export async function setGraph(
  page: Page,
  graph: { nodes: GraphNodeMinimal[]; edges: GraphEdge[] },
  positions?: Record<string, { x: number; y: number }>,
): Promise<void> {
  await withSp(
    page,
    (sp, args) => {
      sp.graph.getState().setGraph(args.graph, args.positions ?? {});
    },
    { graph, positions: positions ?? {} },
  );
}

const TRIVIAL_VERT = `#version 300 es
layout(location=0) in vec3 a_position;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;
void main() {
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
}`;

const TRIVIAL_FRAG = `#version 300 es
precision mediump float;
uniform vec3 u_baseColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_baseColor, 1.0);
}`;

export const trivialShaderSources = {
  vertex: TRIVIAL_VERT,
  fragment: TRIVIAL_FRAG,
};

/** Sphere → unlit shader → output, simplest possible renderable graph. */
export function trivialMeshGraph(): {
  nodes: GraphNodeMinimal[];
  edges: GraphEdge[];
} {
  return {
    nodes: [
      { id: "m1", kind: "mesh", primitive: "sphere" },
      {
        id: "s1",
        kind: "shader",
        vertexSource: TRIVIAL_VERT,
        fragmentSource: TRIVIAL_FRAG,
        uniformValues: { u_baseColor: [0.2, 0.6, 1.0] },
      },
      { id: "o1", kind: "output" },
    ],
    edges: [
      {
        id: "e1",
        source: "m1",
        sourceHandle: "mesh",
        target: "s1",
        targetHandle: "mesh",
      },
      {
        id: "e2",
        source: "s1",
        sourceHandle: "texture",
        target: "o1",
        targetHandle: "texture",
      },
    ],
  };
}

import type { Graph } from "../core/graph/types";
import basicVert from "../shaders/basic.vert?raw";
import blurFrag from "../shaders/templates/blur.frag?raw";
import noiseFrag from "../shaders/templates/noise.frag?raw";
import tonemapFrag from "../shaders/templates/tonemap.frag?raw";
import unlitFrag from "../shaders/templates/unlit.frag?raw";
import uvDebugFrag from "../shaders/templates/uvDebug.frag?raw";
import type { NodePosition } from "./types";

export function createDemoGraph(): Graph {
  return {
    nodes: [
      { id: "mesh1", kind: "mesh", primitive: "sphere" },
      {
        id: "shader1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: unlitFrag,
        uniformValues: {
          u_baseColor: [0.3, 0.7, 1.0],
        },
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
}

export const DEMO_LAYOUT: Record<string, NodePosition> = {
  mesh1: { x: -240, y: 0 },
  shader1: { x: 80, y: 0 },
  output1: { x: 400, y: 0 },
};

export function createChainDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "noise1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: noiseFrag,
        uniformValues: {
          u_scale: 6.0,
          u_tint: [0.4, 0.8, 1.0],
        },
      },
      {
        id: "blur1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: blurFrag,
        uniformValues: {
          u_radius: 2.5,
        },
      },
      {
        id: "tonemap1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: tonemapFrag,
        uniformValues: {
          u_exposure: 1.4,
          u_gamma: 2.2,
        },
      },
      { id: "output1", kind: "output" },
    ],
    edges: [
      {
        id: "e1",
        source: "noise1",
        sourceHandle: "texture",
        target: "blur1",
        targetHandle: "u_tex",
      },
      {
        id: "e2",
        source: "blur1",
        sourceHandle: "texture",
        target: "tonemap1",
        targetHandle: "u_tex",
      },
      {
        id: "e3",
        source: "tonemap1",
        sourceHandle: "texture",
        target: "output1",
        targetHandle: "texture",
      },
    ],
  };
}

export const CHAIN_DEMO_LAYOUT: Record<string, NodePosition> = {
  noise1: { x: -300, y: -60 },
  blur1: { x: -100, y: 60 },
  tonemap1: { x: 100, y: -60 },
  output1: { x: 300, y: 60 },
};

export function createTorusDemoGraph(): Graph {
  return {
    nodes: [
      { id: "mesh1", kind: "mesh", primitive: "torus" },
      {
        id: "shader1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: uvDebugFrag,
        uniformValues: {},
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
}

export const TORUS_DEMO_LAYOUT: Record<string, NodePosition> = {
  mesh1: { x: -240, y: 0 },
  shader1: { x: 80, y: 0 },
  output1: { x: 400, y: 0 },
};

/**
 * Demo that exercises split-viewport: noise → blur → tonemap, but each stage
 * also drives its own Output node, so all three appear side-by-side.
 */
export function createSplitDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "noise1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: noiseFrag,
        uniformValues: { u_scale: 6.0, u_tint: [0.4, 0.8, 1.0] },
      },
      {
        id: "blur1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: blurFrag,
        uniformValues: { u_radius: 2.5 },
      },
      {
        id: "tonemap1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: tonemapFrag,
        uniformValues: { u_exposure: 1.4, u_gamma: 2.2 },
      },
      { id: "out_noise", kind: "output" },
      { id: "out_blur", kind: "output" },
      { id: "out_tone", kind: "output" },
    ],
    edges: [
      {
        id: "e1",
        source: "noise1",
        sourceHandle: "texture",
        target: "blur1",
        targetHandle: "u_tex",
      },
      {
        id: "e2",
        source: "blur1",
        sourceHandle: "texture",
        target: "tonemap1",
        targetHandle: "u_tex",
      },
      {
        id: "eo1",
        source: "noise1",
        sourceHandle: "texture",
        target: "out_noise",
        targetHandle: "texture",
      },
      {
        id: "eo2",
        source: "blur1",
        sourceHandle: "texture",
        target: "out_blur",
        targetHandle: "texture",
      },
      {
        id: "eo3",
        source: "tonemap1",
        sourceHandle: "texture",
        target: "out_tone",
        targetHandle: "texture",
      },
    ],
  };
}

export const SPLIT_DEMO_LAYOUT: Record<string, NodePosition> = {
  noise1: { x: -300, y: -100 },
  blur1: { x: -100, y: 40 },
  tonemap1: { x: 100, y: -100 },
  out_noise: { x: -300, y: 160 },
  out_blur: { x: 100, y: 160 },
  out_tone: { x: 300, y: 40 },
};

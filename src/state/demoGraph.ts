import type { ParentsMap } from "../core/graph/parents";
import type { Graph } from "../core/graph/types";
import basicVert from "../shaders/basic.vert?raw";
import particleVert from "../shaders/particles/particle.vert?raw";
import particleRenderVert from "../shaders/particles/particleRender.vert?raw";
import blurFrag from "../shaders/templates/blur.frag?raw";
import noiseFrag from "../shaders/templates/noise.frag?raw";
import particlePointFrag from "../shaders/templates/particlePoint.frag?raw";
import tonemapFrag from "../shaders/templates/tonemap.frag?raw";
import unlitFrag from "../shaders/templates/unlit.frag?raw";
import uvDebugFrag from "../shaders/templates/uvDebug.frag?raw";
import type { NodePosition } from "./types";

// F-2 (docs/learnability-plan-2026-08.md T3): every demo below now opens with
// one or more purely-visual Group nodes carrying a step-by-step label — "a
// demo you can read like a lesson" instead of just a working graph. Groups
// never enter validate/compile/execute (see core/graph/types.ts's
// GroupGraphNode doc comment) so this cannot change a single demo's
// ExecutionPlan pass count or ordering; it only adds editor-only nodes plus
// entries in graphStore's `parents` map. Per the graphStore.groupSelected
// precedent, a group node MUST precede its children in the `nodes` array (RF
// nesting requirement) — every factory below puts its group(s) first.
//
// Child positions are group-relative (graphStore.ts's groupSelected /
// setParent convention). The single-child groups here follow the same
// footprint groupSelected uses for an interactively-grouped node (ABS_CARD_W
// 200 / ABS_CARD_H 120 + GROUP_SELECTION_PADDING 32 + HEADER_OFFSET 16):
// group abs = (child.x − 32, child.y − 48), size 264×200, child rel = (32,
// 48). Multi-child groups extend the same padding to a hand-computed
// bounding box. Node positions are purely editor coordinates — no test
// asserts exact values, only id/kind/parents — so layouts were widened where
// needed to keep group boxes from overlapping.

export function createDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "grp_mesh",
        kind: "group",
        label: "1 · Mesh — 정점 데이터 (a_position·a_normal·a_uv)",
        width: 264,
        height: 200,
      },
      {
        id: "grp_shader",
        kind: "group",
        label: "2 · Shader — vertex+fragment가 메시를 그린다",
        width: 264,
        height: 200,
      },
      {
        id: "grp_output",
        kind: "group",
        label: "3 · Output — 최종 텍스처를 캔버스로",
        width: 264,
        height: 200,
      },
      { id: "mesh1", kind: "mesh", primitive: "sphere" },
      {
        id: "shader1",
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: unlitFrag,
        uniformValues: {
          // [C-2] Demo art direction, not a generic node default: this value
          // (distinct from starter.frag's @default 0.5,0.7,1.0) is
          // intentionally stored so it wins over the GLSL default — a live
          // example of the "stored value beats @default" backward-compat
          // path every pre-C-2 saved project relies on.
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
  grp_mesh: { x: -272, y: -48 },
  grp_shader: { x: 48, y: -48 },
  grp_output: { x: 368, y: -48 },
  mesh1: { x: 32, y: 48 },
  shader1: { x: 32, y: 48 },
  output1: { x: 32, y: 48 },
};

export const DEMO_PARENTS: ParentsMap = {
  mesh1: "grp_mesh",
  shader1: "grp_shader",
  output1: "grp_output",
};

export function createChainDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "grp_chain_generate",
        kind: "group",
        label: "1 · Generate — mesh 없음 → fullscreen quad",
        width: 264,
        height: 200,
      },
      {
        id: "grp_chain_filter",
        kind: "group",
        label: "2 · Filter — 이전 패스 FBO를 u_tex로 샘플",
        width: 564,
        height: 200,
      },
      {
        id: "grp_chain_display",
        kind: "group",
        label: "3 · Display",
        width: 264,
        height: 200,
      },
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
  grp_chain_generate: { x: -592, y: -48 },
  grp_chain_filter: { x: -232, y: -48 },
  grp_chain_display: { x: 428, y: -48 },
  noise1: { x: 32, y: 48 },
  blur1: { x: 32, y: 48 },
  tonemap1: { x: 332, y: 48 },
  output1: { x: 32, y: 48 },
};

export const CHAIN_DEMO_PARENTS: ParentsMap = {
  noise1: "grp_chain_generate",
  blur1: "grp_chain_filter",
  tonemap1: "grp_chain_filter",
  output1: "grp_chain_display",
};

export function createTorusDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "grp_torus_mesh",
        kind: "group",
        label: "1 · Mesh — torus 정점 데이터, a_uv가 표면을 감싼다",
        width: 264,
        height: 200,
      },
      {
        id: "grp_torus_shader",
        kind: "group",
        label: "2 · Shader — UV Debug: v_uv를 그대로 색으로 출력",
        width: 264,
        height: 200,
      },
      {
        id: "grp_torus_output",
        kind: "group",
        label: "3 · Output — 최종 텍스처를 캔버스로",
        width: 264,
        height: 200,
      },
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
  grp_torus_mesh: { x: -272, y: -48 },
  grp_torus_shader: { x: 48, y: -48 },
  grp_torus_output: { x: 368, y: -48 },
  mesh1: { x: 32, y: 48 },
  shader1: { x: 32, y: 48 },
  output1: { x: 32, y: 48 },
};

export const TORUS_DEMO_PARENTS: ParentsMap = {
  mesh1: "grp_torus_mesh",
  shader1: "grp_torus_shader",
  output1: "grp_torus_output",
};

/**
 * Demo that exercises split-viewport: noise → blur → tonemap, but each stage
 * also drives its own Output node, so all three appear side-by-side.
 */
export function createSplitDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "grp_split_pipeline",
        kind: "group",
        label: "파이프라인 — noise → blur → tonemap",
        width: 784,
        height: 200,
      },
      {
        id: "grp_split_outputs",
        kind: "group",
        label: "각 단계를 Output으로 분기 — 화면 3분할",
        width: 984,
        height: 200,
      },
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
  grp_split_pipeline: { x: -492, y: -188 },
  grp_split_outputs: { x: -492, y: 112 },
  noise1: { x: 32, y: 48 },
  blur1: { x: 292, y: 48 },
  tonemap1: { x: 552, y: 48 },
  out_noise: { x: 32, y: 48 },
  out_blur: { x: 392, y: 48 },
  out_tone: { x: 752, y: 48 },
};

export const SPLIT_DEMO_PARENTS: ParentsMap = {
  noise1: "grp_split_pipeline",
  blur1: "grp_split_pipeline",
  tonemap1: "grp_split_pipeline",
  out_noise: "grp_split_outputs",
  out_blur: "grp_split_outputs",
  out_tone: "grp_split_outputs",
};

/**
 * Particle demo: 1024 POINTS seeded in a sphere flow through a sin-based
 * noise field. ComputeNode → ShaderNode (point renderer) → Output.
 */
export function createParticleDemoGraph(): Graph {
  return {
    nodes: [
      {
        id: "grp_particle_compute",
        kind: "group",
        label: "1 · Compute — transform feedback ping-pong (A/B)",
        width: 264,
        height: 200,
      },
      {
        id: "grp_particle_render",
        kind: "group",
        label: "2 · Render — 파티클 버퍼를 POINTS로",
        width: 264,
        height: 200,
      },
      {
        id: "compute1",
        kind: "compute",
        vertexSource: particleVert,
        count: 1024,
        primitive: "POINTS",
        attributes: [
          {
            inName: "a_position",
            outName: "v_position",
            size: 3,
            seed: "sphere",
          },
          {
            inName: "a_velocity",
            outName: "v_velocity",
            size: 3,
            seed: "zero",
          },
        ],
        uniformValues: { u_dt: 0.016, u_strength: 0.6 },
      },
      {
        id: "render1",
        kind: "shader",
        vertexSource: particleRenderVert,
        fragmentSource: particlePointFrag,
        uniformValues: { u_tint: [0.4, 0.8, 1.0] },
      },
      { id: "output1", kind: "output" },
    ],
    edges: [
      {
        id: "ec",
        source: "compute1",
        sourceHandle: "mesh",
        target: "render1",
        targetHandle: "mesh",
      },
      {
        id: "er",
        source: "render1",
        sourceHandle: "texture",
        target: "output1",
        targetHandle: "texture",
      },
    ],
  };
}

export const PARTICLE_DEMO_LAYOUT: Record<string, NodePosition> = {
  grp_particle_compute: { x: -292, y: -48 },
  grp_particle_render: { x: 28, y: -48 },
  compute1: { x: 32, y: 48 },
  render1: { x: 32, y: 48 },
  output1: { x: 360, y: 0 },
};

// output1 stays top-level (no parent) — the lesson only calls out the two
// GPU-bound stages (Compute/Render); the Output node is the same terminal
// concept covered by every other demo's own "Output" group.
export const PARTICLE_DEMO_PARENTS: ParentsMap = {
  compute1: "grp_particle_compute",
  render1: "grp_particle_render",
};

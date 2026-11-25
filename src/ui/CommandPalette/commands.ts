// The palette's command catalog: every node-creation, preset and app command
// the Command Palette lists, built once per mount by `buildCommands()`. Pure
// data + store actions — the palette component (`CommandPalette`) owns
// ranking, grouping and rendering.
import type {
  CombineArity,
  ComputeGraphNode,
  GraphNode,
  MathOp,
  MeshGraphNode,
  ParamKind,
} from "../../core/graph/types";
import { MAX_OUTPUTS } from "../../core/graph/validate";
import basicVert from "../../shaders/basic.vert?raw";
import particleVert from "../../shaders/particles/particle.vert?raw";
import blendFrag from "../../shaders/templates/blend.frag?raw";
import blurFrag from "../../shaders/templates/blur.frag?raw";
import composite3Frag from "../../shaders/templates/composite3.frag?raw";
import maskFrag from "../../shaders/templates/mask.frag?raw";
import noiseFrag from "../../shaders/templates/noise.frag?raw";
import starterFrag from "../../shaders/templates/starter.frag?raw";
import tonemapFrag from "../../shaders/templates/tonemap.frag?raw";
import unlitFrag from "../../shaders/templates/unlit.frag?raw";
import uvDebugFrag from "../../shaders/templates/uvDebug.frag?raw";
import {
  CHAIN_DEMO_LAYOUT,
  CHAIN_DEMO_PARENTS,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  DEMO_PARENTS,
  PARTICLE_DEMO_LAYOUT,
  PARTICLE_DEMO_PARENTS,
  SPLIT_DEMO_LAYOUT,
  SPLIT_DEMO_PARENTS,
  TORUS_DEMO_LAYOUT,
  TORUS_DEMO_PARENTS,
} from "../../state/demoGraph";
import { useEditorStore } from "../../state/editorStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import type { tokens } from "../../theme";
import { nextId } from "../../utils/id";
import type { CommandKind } from "./helpers";

/** tokens.nodeCategory의 키 — node kind 커맨드의 아이콘 틴트를 고른다. */
type NodeIconCategory = keyof typeof tokens.nodeCategory;

export interface Command {
  id: string;
  kind: CommandKind;
  glyph: string;
  label: string;
  keywords: string;
  /** kind === "node"일 때만 의미 있음 — 아이콘 색 계열(source/process/…). */
  iconCategory?: NodeIconCategory;
  sub?: string;
  /** 앰버 경고 배지 텍스트 — dc Command Palette의 ⚠ needs Mesh. */
  warn?: string;
  keys?: string[];
  run: () => void;
}

/** design/Command Palette.dc.html data()의 유니코드 글리프. */
const GLYPH = {
  mesh: "▣",
  image: "▤",
  webcam: "◉",
  video: "▷",
  audio: "♪",
  shader: "◆",
  // Shader: Unlit's glyph — dc Command Palette (U+25C7, distinct
  // from the starter's U+25C6 shader glyph above).
  shaderVariant: "◇",
  compute: "⚙",
  output: "◎",
  paramFloat: "∙",
  paramVec3: "∷",
  paramColor: "●",
  paramTime: "◷",
  math: "∑",
  swizzle: "⇄",
  combine: "⊞",
  group: "▢",
  clearGraph: "⌧",
  // dc Command Palette (U+25C9 — webcam과 동일 글리프, dc 정본 그대로)
  autoOpen: "◉",
} as const;

const PARAM_GLYPH: Record<ParamKind, string> = {
  float: GLYPH.paramFloat,
  color: GLYPH.paramColor,
  vec3: GLYPH.paramVec3,
  time: GLYPH.paramTime,
};

const PRIMITIVES: MeshGraphNode["primitive"][] = [
  "cube",
  "sphere",
  "plane",
  "torus",
  "quad",
];

export function buildCommands(): Command[] {
  const cmds: Command[] = [];
  const store = useGraphStore.getState();
  const addNode = store.addNode;
  const setGraph = store.setGraph;
  const reset = store.reset;
  const select = useSelectionStore.getState().select;

  const addMesh = (primitive: MeshGraphNode["primitive"]) => {
    const id = nextId("mesh");
    addNode({ id, kind: "mesh", primitive }, { x: -200, y: 0 });
    select(id);
  };

  for (const p of PRIMITIVES) {
    cmds.push({
      id: `add-mesh-${p}`,
      kind: "node",
      glyph: GLYPH.mesh,
      iconCategory: "source",
      label: `Add Mesh: ${p}`,
      keywords: `add node mesh ${p} primitive geometry`,
      run: () => addMesh(p),
    });
  }

  cmds.push({
    id: "add-image",
    kind: "node",
    glyph: GLYPH.image,
    iconCategory: "source",
    label: "Add Image node",
    keywords: "add node image texture",
    run: () => {
      const id = nextId("image");
      addNode({ id, kind: "image", assetId: null }, { x: -200, y: 200 });
      select(id);
    },
  });

  cmds.push({
    id: "add-webcam",
    kind: "node",
    glyph: GLYPH.webcam,
    iconCategory: "source",
    label: "Add Webcam (live camera)",
    keywords: "add node webcam camera live video texture media stream",
    run: () => {
      const id = nextId("webcam");
      addNode({ id, kind: "webcam" }, { x: -200, y: 320 });
      select(id);
    },
  });

  cmds.push({
    id: "add-video",
    kind: "node",
    glyph: GLYPH.video,
    iconCategory: "source",
    label: "Add Video (mp4/webm asset)",
    keywords: "add node video mp4 webm asset movie clip file texture",
    run: () => {
      const id = nextId("video");
      addNode(
        {
          id,
          kind: "video",
          assetId: null,
          playing: true,
          loop: true,
          muted: true,
        },
        { x: -200, y: 440 },
      );
      select(id);
    },
  });

  cmds.push({
    id: "add-audio",
    kind: "node",
    glyph: GLYPH.audio,
    iconCategory: "source",
    label: "Add Audio (mic/file FFT texture)",
    keywords:
      "add node audio mic microphone fft frequency spectrum file mp3 wav",
    run: () => {
      const id = nextId("audio");
      addNode(
        {
          id,
          kind: "audio",
          sourceKind: "mic",
          assetId: null,
          fftSize: 256,
          smoothing: 0.8,
          playing: true,
          loop: true,
        },
        { x: -200, y: 560 },
      );
      select(id);
    },
  });

  // Palette starter item — dc Command Palette. CTA·AppToolbar와 동일하게
  // starter.frag를 쓴다(mesh 유무 양쪽 링크).
  cmds.push({
    id: "add-shader-starter",
    kind: "node",
    glyph: GLYPH.shader, // ◆
    iconCategory: "process",
    label: "Add Shader",
    sub: "starter · links with or without a mesh",
    keywords: "add node shader starter new default fragment glsl",
    run: () => {
      const id = nextId("shader");
      const node: GraphNode = {
        id,
        kind: "shader",
        vertexSource: basicVert,
        fragmentSource: starterFrag,
        // No hardcoded seed values — the initial glow color comes from
        // starter.frag's `@default` hint, bound by compile.ts's
        // withExplicitDefaults at compile time.
        uniformValues: {},
      };
      addNode(node, { x: 100, y: 0 });
      select(id);
    },
  });

  const shaderTemplates: Array<{
    name: string;
    frag: string;
    glyph?: string;
    sub?: string;
    warn?: string;
  }> = [
    {
      name: "Unlit",
      frag: unlitFrag,
      glyph: GLYPH.shaderVariant,
      sub: "reads surface normals",
      warn: "needs Mesh",
    },
    { name: "Noise", frag: noiseFrag },
    { name: "Blur", frag: blurFrag },
    { name: "Tonemap", frag: tonemapFrag },
    { name: "UV Debug", frag: uvDebugFrag },
    { name: "Blend", frag: blendFrag },
    { name: "Composite 3", frag: composite3Frag },
    { name: "Mask", frag: maskFrag },
  ];
  for (const tpl of shaderTemplates) {
    cmds.push({
      id: `add-shader-${tpl.name.toLowerCase()}`,
      kind: "node",
      glyph: tpl.glyph ?? GLYPH.shader,
      iconCategory: "process",
      label: `Add Shader: ${tpl.name}`,
      ...(tpl.sub !== undefined ? { sub: tpl.sub } : {}),
      ...(tpl.warn !== undefined ? { warn: tpl.warn } : {}),
      keywords: `add node shader ${tpl.name} fragment glsl`,
      run: () => {
        const id = nextId("shader");
        const node: GraphNode = {
          id,
          kind: "shader",
          vertexSource: basicVert,
          fragmentSource: tpl.frag,
          // No hardcoded seed values — most of these templates don't
          // even declare u_baseColor, so this was seeding a ghost value.
          // Whatever `@default` hints each template does declare are bound
          // by compile.ts's withExplicitDefaults at compile time.
          uniformValues: {},
        };
        addNode(node, { x: 100, y: 0 });
        select(id);
      },
    });
  }

  cmds.push({
    id: "add-output",
    kind: "node",
    glyph: GLYPH.output,
    iconCategory: "output",
    label: "Add Output node",
    keywords: "add node output canvas display split viewport",
    run: () => {
      const outputs = useGraphStore
        .getState()
        .nodes.filter((n) => n.kind === "output").length;
      if (outputs >= MAX_OUTPUTS) return;
      const id = nextId("output");
      addNode({ id, kind: "output" }, { x: 400, y: 0 });
      select(id);
    },
  });

  cmds.push(
    {
      id: "add-compute-particle",
      kind: "node",
      glyph: GLYPH.compute,
      iconCategory: "process",
      label: "Add Compute: Particle (POINTS)",
      keywords:
        "add node compute transform feedback particle points simulation",
      run: () => {
        const id = nextId("compute");
        const node: ComputeGraphNode = {
          id,
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
          // `particle.vert` already annotates both of these
          // (`@default 0.016` / `@default 0.6`), so `withExplicitDefaults`
          // reproduces the exact same values from the source. Keeping the map
          // here left this one creation path still seeding values with no
          // visible origin — the very thing the other four paths stopped doing.
          uniformValues: {},
        };
        addNode(node, { x: -200, y: 80 });
        select(id);
      },
    },
    {
      id: "add-compute-empty",
      kind: "node",
      glyph: GLYPH.compute,
      iconCategory: "process",
      label: "Add Compute (empty)",
      keywords: "add node compute transform feedback empty blank",
      run: () => {
        const id = nextId("compute");
        const node: ComputeGraphNode = {
          id,
          kind: "compute",
          vertexSource: `#version 300 es\nprecision highp float;\n\nin vec3 a_position;\nout vec3 v_position;\n\nuniform float u_time;\n\nvoid main() {\n  v_position = a_position;\n}\n`,
          count: 256,
          primitive: "POINTS",
          attributes: [
            {
              inName: "a_position",
              outName: "v_position",
              size: 3,
              seed: "sphere",
            },
          ],
          uniformValues: {},
        };
        addNode(node, { x: -200, y: 80 });
        select(id);
      },
    },
  );

  const paramKinds: ParamKind[] = ["float", "color", "vec3", "time"];
  for (const k of paramKinds) {
    cmds.push({
      id: `add-param-${k}`,
      kind: "node",
      glyph: PARAM_GLYPH[k],
      iconCategory: "value",
      label: `Add Parameter: ${k}`,
      keywords: `add node parameter param ${k}`,
      run: () => {
        const id = nextId(`param-${k}`);
        const value: number | number[] =
          k === "float"
            ? 0.5
            : k === "time"
              ? [1, 0]
              : k === "color"
                ? [1, 0.5, 0.2]
                : [0, 0, 0];
        addNode(
          { id, kind: "param", paramKind: k, value },
          { x: -240, y: 240 },
        );
        select(id);
      },
    });
  }

  const mathOps: MathOp[] = [
    "add",
    "subtract",
    "multiply",
    "divide",
    "pow",
    "abs",
    "sin",
    "cos",
  ];
  for (const op of mathOps) {
    cmds.push({
      id: `add-math-${op}`,
      kind: "node",
      glyph: GLYPH.math,
      iconCategory: "value",
      label: `Add Math: ${op}`,
      keywords: `add node math ${op} utility scalar arithmetic`,
      run: () => {
        const id = nextId("math");
        addNode({ id, kind: "math", op, a: 0, b: 0 }, { x: -240, y: 320 });
        select(id);
      },
    });
  }

  const swizzleMasks = ["xyz", "xy", "zyx", "xxxx", "wzyx", "x", "y", "z"];
  for (const mask of swizzleMasks) {
    cmds.push({
      id: `add-swizzle-${mask}`,
      kind: "node",
      glyph: GLYPH.swizzle,
      iconCategory: "value",
      label: `Add Swizzle: .${mask}`,
      keywords: `add node swizzle vec decompose ${mask} utility`,
      run: () => {
        const id = nextId("swizzle");
        addNode({ id, kind: "swizzle", mask }, { x: -120, y: 320 });
        select(id);
      },
    });
  }

  const combineArities: CombineArity[] = [2, 3, 4];
  for (const arity of combineArities) {
    cmds.push({
      id: `add-combine-${arity}`,
      kind: "node",
      glyph: GLYPH.combine,
      iconCategory: "value",
      label: `Add Combine: Float×${arity} → vec${arity}`,
      keywords: `add node combine vec ${arity} compose utility`,
      run: () => {
        const id = nextId("combine");
        addNode(
          { id, kind: "combine", arity, values: [0, 0, 0, 0] },
          { x: 0, y: 320 },
        );
        select(id);
      },
    });
  }

  cmds.push(
    {
      id: "add-group",
      kind: "node",
      glyph: GLYPH.group,
      iconCategory: "container",
      label: "Add Group (empty container)",
      keywords: "add node group container box section comment",
      run: () => {
        const id = useGraphStore
          .getState()
          .addGroup("Group", { x: -200, y: -120 }, { width: 360, height: 260 });
        select(id);
      },
    },
    {
      id: "group-selected",
      kind: "command",
      glyph: GLYPH.group,
      label: "Group selected nodes",
      sub: "wrap 2+ selected nodes in a container",
      keys: ["⌘G"],
      keywords: "group wrap selection nodes container box cmd ctrl g",
      run: () => {
        const sel = useSelectionStore.getState().selectedNodeIds;
        if (sel.length < 2) return;
        const newId = useGraphStore.getState().groupSelected(sel);
        if (newId) select(newId);
      },
    },
    {
      id: "preset-sphere",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Sphere",
      sub: "3 nodes · sphere + unlit shader",
      keywords: "preset demo sphere",
      run: () => setGraph(createDemoGraph(), DEMO_LAYOUT, DEMO_PARENTS),
    },
    {
      id: "preset-torus",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Torus UV",
      sub: "3 nodes · torus + UV debug",
      keywords: "preset demo torus uv",
      run: () =>
        setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT, TORUS_DEMO_PARENTS),
    },
    {
      id: "preset-chain",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Chain (noise → blur → tonemap)",
      sub: "4 nodes · noise → blur → tonemap",
      keywords: "preset demo chain noise blur tonemap",
      run: () =>
        setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT, CHAIN_DEMO_PARENTS),
    },
    {
      id: "preset-split",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Split viewport (3 outputs)",
      sub: "6 nodes · 3-way split viewport",
      keywords: "preset demo split viewport multi output",
      run: () =>
        setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT, SPLIT_DEMO_PARENTS),
    },
    {
      id: "preset-particle",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Particle compute (Transform Feedback)",
      sub: "3 nodes · 1024-point compute sim",
      keywords: "preset demo particle compute transform feedback simulation",
      run: () =>
        setGraph(
          createParticleDemoGraph(),
          PARTICLE_DEMO_LAYOUT,
          PARTICLE_DEMO_PARENTS,
        ),
    },
    {
      id: "graph-clear",
      kind: "command",
      glyph: GLYPH.clearGraph,
      label: "Clear graph",
      sub: "remove all nodes",
      keywords: "clear empty reset",
      run: () => reset(),
    },
    // Auto-open 도달성 — Code가 34px 레일로 접히면 인라인 토글이 숨으므로
    // 팔레트에서 접힘과 무관하게 토글한다 (dc Command Palette.dc.html
    // "Toggle Code auto-open"). AutoOpenToggle.tsx와 동일하게 editorStore의
    // setAutoCode를 재사용 — 상태는 run() 시점에 읽는다(빌드 시 캡처 금지).
    {
      id: "toggle-code-auto-open",
      kind: "command",
      glyph: GLYPH.autoOpen,
      label: "Toggle Code auto-open",
      sub: "open Code on Shader/Compute selection — reachable even when the Code rail is collapsed",
      keywords:
        "toggle code auto open auto-open collapse expand rail shader compute editor",
      run: () => {
        const { autoCode, setAutoCode } = useEditorStore.getState();
        setAutoCode(!autoCode);
      },
    },
  );

  return cmds;
}

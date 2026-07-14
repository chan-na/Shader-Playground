import { useEffect, useMemo, useRef, useState } from "react";
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
import tonemapFrag from "../../shaders/templates/tonemap.frag?raw";
import unlitFrag from "../../shaders/templates/unlit.frag?raw";
import uvDebugFrag from "../../shaders/templates/uvDebug.frag?raw";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  PARTICLE_DEMO_LAYOUT,
  SPLIT_DEMO_LAYOUT,
  TORUS_DEMO_LAYOUT,
} from "../../state/demoGraph";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { nextId } from "../../utils/id";
import {
  type CommandKind,
  cycleModePrefix,
  type FuzzySegment,
  fuzzySegments,
  groupCommands,
  nextActive,
  parseMode,
  prevActive,
  rankCommands,
} from "./helpers";

/** tokens.nodeCategory의 키 — node kind 커맨드의 아이콘 틴트를 고른다. */
type NodeIconCategory = keyof typeof tokens.nodeCategory;

interface Command {
  id: string;
  kind: CommandKind;
  glyph: string;
  label: string;
  keywords: string;
  /** kind === "node"일 때만 의미 있음 — 아이콘 색 계열(source/process/…). */
  iconCategory?: NodeIconCategory;
  sub?: string;
  keys?: string[];
  run: () => void;
}

/** design/Command Palette.dc.html data() L195-211의 유니코드 글리프. */
const GLYPH = {
  mesh: "▣",
  image: "▤",
  webcam: "◉",
  video: "▷",
  audio: "♪",
  shader: "◆",
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

function buildCommands(): Command[] {
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

  const shaderTemplates: Array<{ name: string; frag: string }> = [
    { name: "Unlit", frag: unlitFrag },
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
      glyph: GLYPH.shader,
      iconCategory: "process",
      label: `Add Shader: ${tpl.name}`,
      keywords: `add node shader ${tpl.name} fragment glsl`,
      run: () => {
        const id = nextId("shader");
        const node: GraphNode = {
          id,
          kind: "shader",
          vertexSource: basicVert,
          fragmentSource: tpl.frag,
          uniformValues: { u_baseColor: [0.5, 0.7, 1.0] },
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
          uniformValues: { u_dt: 0.016, u_strength: 0.6 },
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
      run: () => setGraph(createDemoGraph(), DEMO_LAYOUT),
    },
    {
      id: "preset-torus",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Torus UV",
      sub: "3 nodes · torus + UV debug",
      keywords: "preset demo torus uv",
      run: () => setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT),
    },
    {
      id: "preset-chain",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Chain (noise → blur → tonemap)",
      sub: "4 nodes · noise → blur → tonemap",
      keywords: "preset demo chain noise blur tonemap",
      run: () => setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT),
    },
    {
      id: "preset-split",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Split viewport (3 outputs)",
      sub: "6 nodes · 3-way split viewport",
      keywords: "preset demo split viewport multi output",
      run: () => setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT),
    },
    {
      id: "preset-particle",
      kind: "preset",
      glyph: GLYPH.image,
      label: "Load preset: Particle compute (Transform Feedback)",
      sub: "3 nodes · 1024-point compute sim",
      keywords: "preset demo particle compute transform feedback simulation",
      run: () => setGraph(createParticleDemoGraph(), PARTICLE_DEMO_LAYOUT),
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
  );

  return cmds;
}

/** node kind 커맨드의 아이콘 박스 색 계열 → CSS 클래스 접미사. */
function iconVariant(cmd: Command): string {
  if (cmd.kind === "preset") return "preset";
  if (cmd.kind === "command") return "command";
  return cmd.iconCategory ?? "container";
}

const TAG_LABEL: Record<CommandKind, string> = {
  node: "NODE",
  command: "CMD",
  preset: "PRESET",
};

/**
 * fuzzySegments()의 결과에 React key를 붙인다. 세그먼트는 label을 처음부터
 * 끝까지 빈틈없이 나눈 것이므로, 지금까지 소비한 글자 수(누적 offset)가
 * 라벨 안에서의 위치를 나타내는 안정적인 키가 된다 — 루프 인덱스 자체를
 * key로 쓰는 것과 달리 세그먼트의 내용(길이)에서 유도된 값이다.
 */
function keyedSegments(
  label: string,
  term: string,
): Array<FuzzySegment & { key: number }> {
  let offset = 0;
  return fuzzySegments(label, term).map((seg) => {
    const key = offset;
    offset += seg.text.length;
    return { ...seg, key };
  });
}

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        setQuery("");
        setActive(0);
      } else if (e.key === "Escape" && open) {
        useCommandPaletteStore.getState().setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Defer focus so the input mounts before focus() runs.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo(() => buildCommands(), []);
  const { mode, term } = parseMode(query);
  const pool = useMemo(
    () => (mode === "all" ? commands : commands.filter((c) => c.kind === mode)),
    [commands, mode],
  );
  const ranked = useMemo(() => rankCommands(pool, term), [pool, term]);
  const groups = useMemo(() => groupCommands(ranked), [ranked]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  let flatIndex = 0;
  const renderGroups = groups.map((g) => ({
    title: g.title,
    count: g.items.length,
    rows: g.items.map((cmd) => ({ cmd, index: flatIndex++ })),
  }));
  const displayTerm = query.replace(/^[@>/]/, "");

  if (!open) return null;

  const run = (cmd: Command) => {
    cmd.run();
    setOpen(false);
  };

  const resultCount = `${flat.length} ${flat.length === 1 ? "result" : "results"}`;

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      data-testid="command-palette"
    >
      <div
        className="cmdk-modal"
        style={{
          boxShadow: `var(--shadow-modal), 0 0 40px ${withAlpha(tokens.accent.default, 0.08)}`,
        }}
      >
        <div className="cmdk-search">
          <span className="cmdk-search-icon">⌕</span>
          {mode !== "all" && (
            <span className={`cmdk-mode-chip cmdk-mode-chip--${mode}`}>
              {mode === "node"
                ? "@ nodes"
                : mode === "command"
                  ? "> commands"
                  : "/ presets"}
            </span>
          )}
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search nodes, commands, presets…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => nextActive(a, flat.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(prevActive);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = flat[active];
                if (cmd) run(cmd);
              } else if (e.key === "Tab") {
                e.preventDefault();
                setQuery(cycleModePrefix(query));
                setActive(0);
              }
            }}
          />
          <span className="cmdk-esc-chip">esc</span>
        </div>

        <div className="cmdk-results">
          {flat.length === 0 ? (
            <div className="cmdk-empty">
              <div className="cmdk-empty-icon">⌕</div>
              <div className="cmdk-empty-text">
                No matches for “<strong>{displayTerm}</strong>”
              </div>
            </div>
          ) : (
            renderGroups.map((g) => (
              <div key={g.title}>
                <div className="cmdk-group-header">
                  <span className="cmdk-group-title">{g.title}</span>
                  <span className="cmdk-group-count">{g.count}</span>
                </div>
                {g.rows.map(({ cmd, index }) => (
                  <button
                    type="button"
                    key={cmd.id}
                    tabIndex={-1}
                    className={
                      index === active
                        ? "cmdk-row cmdk-row--active"
                        : "cmdk-row"
                    }
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(cmd)}
                  >
                    <span
                      className={`cmdk-icon cmdk-icon--${iconVariant(cmd)}`}
                    >
                      {cmd.glyph}
                    </span>
                    <span className="cmdk-main">
                      <span className="cmdk-label">
                        {keyedSegments(cmd.label, term).map((seg) => (
                          <span
                            key={seg.key}
                            className={seg.hit ? "cmdk-seg--hit" : undefined}
                          >
                            {seg.text}
                          </span>
                        ))}
                      </span>
                      {cmd.sub && <span className="cmdk-sub">{cmd.sub}</span>}
                    </span>
                    <span
                      className={`cmdk-tag${cmd.kind === "preset" ? " cmdk-tag--preset" : ""}`}
                    >
                      {TAG_LABEL[cmd.kind]}
                    </span>
                    <span className="cmdk-trailing">
                      {index === active && (
                        <span className="cmdk-enter-glyph">↵</span>
                      )}
                      {cmd.keys?.map((k) => (
                        <span key={k} className="cmdk-key-chip">
                          {k}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-hint">
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">↑↓</span>navigate
          </span>
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">↵</span>select
          </span>
          <span className="cmdk-hint-item">
            <span className="cmdk-hint-key">tab</span>next mode
          </span>
          <span className="cmdk-hint-spacer" />
          <span>{resultCount}</span>
        </div>
      </div>

      <div className="cmdk-legend">
        <span>Type to fuzzy-search, or prefix:</span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--node">@</span>
          nodes
        </span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--command">
            &gt;
          </span>
          commands
        </span>
        <span className="cmdk-legend-item">
          <span className="cmdk-legend-chip cmdk-legend-chip--preset">/</span>
          presets
        </span>
      </div>
    </div>
  );
}

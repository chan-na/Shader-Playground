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
import noiseFrag from "../../shaders/templates/noise.frag?raw";
import tonemapFrag from "../../shaders/templates/tonemap.frag?raw";
import unlitFrag from "../../shaders/templates/unlit.frag?raw";
import uvDebugFrag from "../../shaders/templates/uvDebug.frag?raw";
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
import { nextId } from "../../utils/id";
import { nextActive, prevActive, rankCommands } from "./helpers";

interface Command {
  id: string;
  category: string;
  label: string;
  keywords: string;
  run: () => void;
}

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
      category: "Node",
      label: `Add Mesh: ${p}`,
      keywords: `add node mesh ${p} primitive geometry`,
      run: () => addMesh(p),
    });
  }

  cmds.push({
    id: "add-image",
    category: "Node",
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
    category: "Node",
    label: "Add Webcam (live camera)",
    keywords: "add node webcam camera live video texture media stream",
    run: () => {
      const id = nextId("webcam");
      addNode({ id, kind: "webcam" }, { x: -200, y: 320 });
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
  ];
  for (const tpl of shaderTemplates) {
    cmds.push({
      id: `add-shader-${tpl.name.toLowerCase()}`,
      category: "Node",
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
    category: "Node",
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
      category: "Node",
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
      category: "Node",
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
      category: "Node",
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
      category: "Node",
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
      category: "Node",
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
      category: "Node",
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
      id: "preset-sphere",
      category: "Preset",
      label: "Load preset: Sphere",
      keywords: "preset demo sphere",
      run: () => setGraph(createDemoGraph(), DEMO_LAYOUT),
    },
    {
      id: "preset-torus",
      category: "Preset",
      label: "Load preset: Torus UV",
      keywords: "preset demo torus uv",
      run: () => setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT),
    },
    {
      id: "preset-chain",
      category: "Preset",
      label: "Load preset: Chain (noise → blur → tonemap)",
      keywords: "preset demo chain noise blur tonemap",
      run: () => setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT),
    },
    {
      id: "preset-split",
      category: "Preset",
      label: "Load preset: Split viewport (3 outputs)",
      keywords: "preset demo split viewport multi output",
      run: () => setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT),
    },
    {
      id: "preset-particle",
      category: "Preset",
      label: "Load preset: Particle compute (Transform Feedback)",
      keywords: "preset demo particle compute transform feedback simulation",
      run: () => setGraph(createParticleDemoGraph(), PARTICLE_DEMO_LAYOUT),
    },
    {
      id: "graph-clear",
      category: "Graph",
      label: "Clear graph",
      keywords: "clear empty reset",
      run: () => reset(),
    },
  );

  return cmds;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActive(0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
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
  const ranked = useMemo(
    () => rankCommands(commands, query),
    [commands, query],
  );

  if (!open) return null;

  const run = (cmd: Command) => {
    cmd.run();
    setOpen(false);
  };

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
      <div className="cmdk-modal">
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Search nodes, presets, commands…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => nextActive(a, ranked.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(prevActive);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const cmd = ranked[active];
              if (cmd) run(cmd);
            }
          }}
        />
        <div className="cmdk-list">
          {ranked.length === 0 && <div className="cmdk-empty">No matches</div>}
          {ranked.map((cmd, i) => (
            <button
              type="button"
              key={cmd.id}
              tabIndex={-1}
              className={
                i === active ? "cmdk-row cmdk-row--active" : "cmdk-row"
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => run(cmd)}
            >
              <span className="cmdk-cat">{cmd.category}</span>
              <span className="cmdk-label">{cmd.label}</span>
            </button>
          ))}
        </div>
        <div className="cmdk-hint">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

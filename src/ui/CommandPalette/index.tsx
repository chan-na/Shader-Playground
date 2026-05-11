import { useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/graphStore';
import { useSelectionStore } from '../../state/selectionStore';
import {
  createDemoGraph,
  DEMO_LAYOUT,
  createChainDemoGraph,
  CHAIN_DEMO_LAYOUT,
  createTorusDemoGraph,
  TORUS_DEMO_LAYOUT,
  createSplitDemoGraph,
  SPLIT_DEMO_LAYOUT,
} from '../../state/demoGraph';
import { nextId } from '../../utils/id';
import basicVert from '../../shaders/basic.vert?raw';
import unlitFrag from '../../shaders/templates/unlit.frag?raw';
import noiseFrag from '../../shaders/templates/noise.frag?raw';
import blurFrag from '../../shaders/templates/blur.frag?raw';
import tonemapFrag from '../../shaders/templates/tonemap.frag?raw';
import uvDebugFrag from '../../shaders/templates/uvDebug.frag?raw';
import blendFrag from '../../shaders/templates/blend.frag?raw';
import type { GraphNode, MeshGraphNode, ParamKind } from '../../core/graph/types';
import { MAX_OUTPUTS } from '../../core/graph/validate';

interface Command {
  id: string;
  category: string;
  label: string;
  keywords: string;
  run: () => void;
}

const PRIMITIVES: MeshGraphNode['primitive'][] = ['cube', 'sphere', 'plane', 'torus', 'quad'];

function buildCommands(): Command[] {
  const cmds: Command[] = [];
  const store = useGraphStore.getState();
  const addNode = store.addNode;
  const setGraph = store.setGraph;
  const reset = store.reset;
  const select = useSelectionStore.getState().select;

  const addMesh = (primitive: MeshGraphNode['primitive']) => {
    const id = nextId('mesh');
    addNode({ id, kind: 'mesh', primitive }, { x: -200, y: 0 });
    select(id);
  };

  for (const p of PRIMITIVES) {
    cmds.push({
      id: `add-mesh-${p}`,
      category: 'Node',
      label: `Add Mesh: ${p}`,
      keywords: `add node mesh ${p} primitive geometry`,
      run: () => addMesh(p),
    });
  }

  cmds.push({
    id: 'add-image',
    category: 'Node',
    label: 'Add Image node',
    keywords: 'add node image texture',
    run: () => {
      const id = nextId('image');
      addNode({ id, kind: 'image', assetId: null }, { x: -200, y: 200 });
      select(id);
    },
  });

  const shaderTemplates: Array<{ name: string; frag: string }> = [
    { name: 'Unlit', frag: unlitFrag },
    { name: 'Noise', frag: noiseFrag },
    { name: 'Blur', frag: blurFrag },
    { name: 'Tonemap', frag: tonemapFrag },
    { name: 'UV Debug', frag: uvDebugFrag },
    { name: 'Blend', frag: blendFrag },
  ];
  for (const tpl of shaderTemplates) {
    cmds.push({
      id: `add-shader-${tpl.name.toLowerCase()}`,
      category: 'Node',
      label: `Add Shader: ${tpl.name}`,
      keywords: `add node shader ${tpl.name} fragment glsl`,
      run: () => {
        const id = nextId('shader');
        const node: GraphNode = {
          id,
          kind: 'shader',
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
    id: 'add-output',
    category: 'Node',
    label: 'Add Output node',
    keywords: 'add node output canvas display split viewport',
    run: () => {
      const outputs = useGraphStore.getState().nodes.filter((n) => n.kind === 'output').length;
      if (outputs >= MAX_OUTPUTS) return;
      const id = nextId('output');
      addNode({ id, kind: 'output' }, { x: 400, y: 0 });
      select(id);
    },
  });

  const paramKinds: ParamKind[] = ['float', 'color', 'vec3', 'time'];
  for (const k of paramKinds) {
    cmds.push({
      id: `add-param-${k}`,
      category: 'Node',
      label: `Add Parameter: ${k}`,
      keywords: `add node parameter param ${k}`,
      run: () => {
        const id = nextId(`param-${k}`);
        const value: number | number[] =
          k === 'float' ? 0.5 : k === 'time' ? [1, 0] : k === 'color' ? [1, 0.5, 0.2] : [0, 0, 0];
        addNode({ id, kind: 'param', paramKind: k, value }, { x: -240, y: 240 });
        select(id);
      },
    });
  }

  cmds.push(
    {
      id: 'preset-sphere',
      category: 'Preset',
      label: 'Load preset: Sphere',
      keywords: 'preset demo sphere',
      run: () => setGraph(createDemoGraph(), DEMO_LAYOUT),
    },
    {
      id: 'preset-torus',
      category: 'Preset',
      label: 'Load preset: Torus UV',
      keywords: 'preset demo torus uv',
      run: () => setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT),
    },
    {
      id: 'preset-chain',
      category: 'Preset',
      label: 'Load preset: Chain (noise → blur → tonemap)',
      keywords: 'preset demo chain noise blur tonemap',
      run: () => setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT),
    },
    {
      id: 'preset-split',
      category: 'Preset',
      label: 'Load preset: Split viewport (3 outputs)',
      keywords: 'preset demo split viewport multi output',
      run: () => setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT),
    },
    {
      id: 'graph-clear',
      category: 'Graph',
      label: 'Clear graph',
      keywords: 'clear empty reset',
      run: () => reset(),
    },
  );

  return cmds;
}

function fuzzyMatch(haystack: string, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(q)) return 100 - h.indexOf(q);
  let qi = 0;
  let score = 0;
  for (let i = 0; i < h.length && qi < q.length; i++) {
    if (h[i] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setActive(0);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Defer focus so the input mounts before focus() runs.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo(() => buildCommands(), [open]);
  const ranked = useMemo(() => {
    if (!query) return commands;
    return commands
      .map((c) => ({ c, s: fuzzyMatch(`${c.label} ${c.keywords}`, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

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
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, ranked.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const cmd = ranked[active];
              if (cmd) run(cmd);
            }
          }}
        />
        <div className="cmdk-list">
          {ranked.length === 0 && (
            <div className="cmdk-empty">No matches</div>
          )}
          {ranked.map((cmd, i) => (
            <div
              key={cmd.id}
              className={i === active ? 'cmdk-row cmdk-row--active' : 'cmdk-row'}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(cmd)}
            >
              <span className="cmdk-cat">{cmd.category}</span>
              <span className="cmdk-label">{cmd.label}</span>
            </div>
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

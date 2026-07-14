import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { Graph, GraphNode, GraphNodeKind } from "../core/graph/types";
import { importFiles } from "../state/assetActions";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createParticleDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  PARTICLE_DEMO_LAYOUT,
  TORUS_DEMO_LAYOUT,
} from "../state/demoGraph";
import { useGraphStore } from "../state/graphStore";
import type { NodePosition } from "../state/types";
import { tokens, withAlpha } from "../theme";
import { GraphEmptyState } from "./GraphEmptyState";
import { NODE_CATEGORY_OF } from "./NodeEditor/nodeTheme";

/**
 * First-run empty-canvas overlay (Welcome.dc.html L87-145). NodeEditor mounts
 * this only while the graph is empty (0 nodes), as a ReactFlow sibling inside
 * `.panel-body` (already `position: relative`) — the same slot pattern as
 * the selection-count-badge. The root is `pointer-events: auto` (see
 * index.css's `.welcome-overlay` comment) — at narrower dock layouts
 * `.welcome-content` is taller than the panel, so the overlay's own
 * `overflow: auto` has to actually receive the wheel instead of it falling
 * through to ReactFlow's pane and being consumed as a zoom gesture. That
 * only costs passthrough canvas-pan over the overlay's empty margins, which
 * is moot — the graph is empty (0 nodes) whenever this is mounted, so
 * there's nothing behind it to pan toward.
 *
 * The design's brand mark is a bespoke SVG symbol (dc.html L33-43) with a
 * `spBreathe` looping halo (L96) — both are intentionally NOT reproduced
 * here: the symbol is swapped for a 3×-scaled version of AppToolbar.tsx's
 * existing `tb-brand` mark (reuse over new asset), and the halo is a static
 * glow (no keyframe) per CLAUDE.md's "상시 애니메이션 금지" policy.
 *
 * Once `dismissed` (the "Start blank" button below), this renders
 * `GraphEmptyState` instead of `null` — the design's empty-graph onboarding
 * (design/System States.dc.html, M7-U2) — whose "Load a preset" flips
 * `dismissed` back to false to return here.
 */

interface StarterTag {
  kind: GraphNodeKind;
  category: keyof typeof tokens.nodeCategory;
}

interface Starter {
  key: "sphere" | "torus" | "chain" | "particle";
  title: string;
  desc: string;
  nodeCount: number;
  tags: StarterTag[];
  factory: () => Graph;
  layout: Record<string, NodePosition>;
}

/** Distinct node kinds present in a graph, in first-seen order — drives the
 * card's tag row (dot color = that kind's category, tokens.nodeCategory). */
function uniqueTags(nodes: GraphNode[]): StarterTag[] {
  const seen = new Set<GraphNodeKind>();
  const tags: StarterTag[] = [];
  for (const n of nodes) {
    if (seen.has(n.kind)) continue;
    seen.add(n.kind);
    tags.push({ kind: n.kind, category: NODE_CATEGORY_OF[n.kind] });
  }
  return tags;
}

// Node counts/tags are derived once from the real demo factories at module
// load — cheap (plain object literals, no GL/DOM work) and keeps the "N
// nodes" chip and tag row honest without recomputing per render.
const sphereGraph = createDemoGraph();
const torusGraph = createTorusDemoGraph();
const chainGraph = createChainDemoGraph();
const particleGraph = createParticleDemoGraph();

const SPHERE_STARTER: Starter = {
  key: "sphere",
  title: "Sphere",
  desc: "A shaded sphere mesh piped straight to Output — the smallest possible graph, three nodes end to end.",
  nodeCount: sphereGraph.nodes.length,
  tags: uniqueTags(sphereGraph.nodes),
  factory: createDemoGraph,
  layout: DEMO_LAYOUT,
};

const TORUS_STARTER: Starter = {
  key: "torus",
  title: "Torus UV",
  desc: "Same three-node shape as Sphere, wired to a UV-debug shader instead — see exactly how coordinates wrap a mesh.",
  nodeCount: torusGraph.nodes.length,
  tags: uniqueTags(torusGraph.nodes),
  factory: createTorusDemoGraph,
  layout: TORUS_DEMO_LAYOUT,
};

const CHAIN_STARTER: Starter = {
  key: "chain",
  title: "Chain",
  desc: "Noise feeds blur feeds tonemap — a three-stage post-process pipeline chained before the Output.",
  nodeCount: chainGraph.nodes.length,
  tags: uniqueTags(chainGraph.nodes),
  factory: createChainDemoGraph,
  layout: CHAIN_DEMO_LAYOUT,
};

const PARTICLE_STARTER: Starter = {
  key: "particle",
  title: "Particle field",
  desc: "A 1024-point compute pass drives a point-sprite shader — GPU simulation feeding the Output directly.",
  nodeCount: particleGraph.nodes.length,
  tags: uniqueTags(particleGraph.nodes),
  factory: createParticleDemoGraph,
  layout: PARTICLE_DEMO_LAYOUT,
};

const STARTERS: Starter[] = [
  SPHERE_STARTER,
  TORUS_STARTER,
  CHAIN_STARTER,
  PARTICLE_STARTER,
];

/** CSS modifier suffix for each starter's thumbnail artwork — the gradients
 * themselves are static var(--*)-only classes in index.css
 * (.welcome-card-thumb--<key>), matching the .cmdk-icon--<category>
 * convention rather than computing them inline here. */
const THUMB_CLASS: Record<Starter["key"], string> = {
  sphere: "welcome-card-thumb--sphere",
  torus: "welcome-card-thumb--torus",
  chain: "welcome-card-thumb--chain",
  particle: "welcome-card-thumb--particle",
};

function createStarterGraph(starter: Starter): void {
  useGraphStore.getState().setGraph(starter.factory(), starter.layout);
}

/** AppToolbar.tsx onFilesChosen's accept string, reused verbatim. */
const FILE_ACCEPT =
  ".obj,.gltf,.glb,image/*,video/*,.mp4,.webm,.mov,.ogv,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac";

/** Scaled-up (~3×) version of AppToolbar.tsx's BRAND_SHADOW/-SQUARE_BORDER/
 * -DOT_BORDER constants for the enlarged 78px welcome mark. Kept local
 * (not imported) since AppToolbar doesn't export them and isn't part of
 * this unit's scope. The white channel here can't be expressed as a static
 * CSS var, so — like AppToolbar's own inline mark — it stays inline while
 * position/size/gradient (all token-only) live in index.css. */
const MARK_SHADOW = `0 6px 20px ${withAlpha(tokens.accent.default, 0.35)}, inset 0 1px 0 ${withAlpha("#ffffff", 0.25)}`;
const SQUARE_BORDER = `5px solid ${withAlpha("#ffffff", 0.92)}`;
const DOT_BORDER = `4px solid ${withAlpha("#ffffff", 0.95)}`;

/** "N nodes" thumbnail chip (Welcome.dc.html L110) — identical across all 4
 * cards. color/border need a white channel, so those stay inline; position/
 * font/padding/radius live in .welcome-card-chip (index.css). */
const CHIP_STYLE: CSSProperties = {
  color: withAlpha("#ffffff", 0.82),
  background: withAlpha(tokens.surface.appDarker, 0.5),
  border: `1px solid ${withAlpha("#ffffff", 0.14)}`,
};

/** Primary "Create …" button's inset highlight (Welcome.dc.html L130) — same
 * white-channel reasoning as CHIP_STYLE above. */
const CREATE_SHADOW = `0 4px 16px ${withAlpha(tokens.accent.default, 0.32)}, 0 1px 0 ${withAlpha("#ffffff", 0.15)} inset`;

const KBD_STYLE: CSSProperties = {
  background: withAlpha("#ffffff", 0.18),
};

export function WelcomeOverlay() {
  const [dismissed, setDismissed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<Starter["key"]>("sphere");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected =
    STARTERS.find((s) => s.key === selectedKey) ?? SPHERE_STARTER;

  // Enter creates the currently-selected starter, but only when nothing else
  // is focused (an input, the command palette, etc.) — otherwise this would
  // hijack Enter from every text field on the page. Skipped entirely once
  // dismissed so a stray Enter after "Start blank" can't silently repopulate
  // the graph the user just asked to keep empty.
  useEffect(() => {
    if (dismissed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (document.activeElement !== document.body) return;
      e.preventDefault();
      createStarterGraph(selected);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissed, selected]);

  if (dismissed) {
    return <GraphEmptyState onLoadPreset={() => setDismissed(false)} />;
  }

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) void importFiles(files);
    e.target.value = "";
  };

  return (
    <div className="welcome-overlay" data-testid="welcome-overlay">
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-content">
        <div className="welcome-brand-wrap" aria-hidden="true">
          <div className="welcome-brand-halo" />
          <div
            className="welcome-brand-mark"
            style={{ boxShadow: MARK_SHADOW }}
          >
            <div
              className="welcome-brand-square"
              style={{ border: SQUARE_BORDER }}
            />
            <div className="welcome-brand-dot" style={{ border: DOT_BORDER }} />
          </div>
        </div>

        <div className="welcome-eyebrow">Welcome to ShaderPlayground</div>
        <h1 className="welcome-title">
          Start from a template, or wire up nodes from scratch.
        </h1>
        <p className="welcome-lead">
          Every project is a graph: sources feed a shader, the shader feeds an
          output. Pick a starting point below and edit the code live.
        </p>

        <div className="welcome-grid">
          {STARTERS.map((s) => {
            const isSelected = s.key === selectedKey;
            return (
              <button
                key={s.key}
                type="button"
                data-testid={`welcome-card-${s.key}`}
                className={
                  isSelected
                    ? "welcome-card welcome-card--selected"
                    : "welcome-card"
                }
                onClick={() => setSelectedKey(s.key)}
              >
                <div className={`welcome-card-thumb ${THUMB_CLASS[s.key]}`}>
                  <span className="welcome-card-chip" style={CHIP_STYLE}>
                    {`${s.nodeCount} nodes`}
                  </span>
                  {isSelected && (
                    <span className="welcome-card-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </div>
                <div className="welcome-card-body">
                  <div className="welcome-card-title">{s.title}</div>
                  <div className="welcome-card-desc">{s.desc}</div>
                  <div className="welcome-card-tags">
                    {s.tags.map((t) => (
                      <span key={t.kind} className="welcome-card-tag">
                        <span
                          className={`welcome-card-tag-dot welcome-card-tag-dot--${t.category}`}
                        />
                        {t.kind}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="welcome-actions">
          <button
            type="button"
            data-testid="welcome-create-button"
            className="welcome-create"
            style={{ boxShadow: CREATE_SHADOW }}
            onClick={() => createStarterGraph(selected)}
          >
            {`Create ${selected.title}`}
            <span
              className="welcome-create-kbd"
              style={KBD_STYLE}
              aria-hidden="true"
            >
              ↵
            </span>
          </button>
          <button
            type="button"
            data-testid="welcome-blank-button"
            className="welcome-blank"
            onClick={() => setDismissed(true)}
          >
            Start blank
          </button>
        </div>

        <div className="welcome-links">
          <button
            type="button"
            className="welcome-link"
            onClick={() => useCommandPaletteStore.getState().setOpen(true)}
          >
            <span className="welcome-link-icon" aria-hidden="true">
              ▤
            </span>
            Browse all presets
          </button>
          <span className="welcome-link-dot" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="welcome-link"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="welcome-link-icon" aria-hidden="true">
              ⤓
            </span>
            Import a file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={onFilesChosen}
          />
        </div>
      </div>
    </div>
  );
}

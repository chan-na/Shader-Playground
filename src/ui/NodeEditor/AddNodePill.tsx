import type { GraphNode } from "../../core/graph/types";
import { MAX_OUTPUTS } from "../../core/graph/validate";
import basicVert from "../../shaders/basic.vert?raw";
import starterFrag from "../../shaders/templates/starter.frag?raw";
import { useCommandPaletteStore } from "../../state/commandPaletteStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { tokens, withAlpha } from "../../theme";
import { nextId } from "../../utils/id";

/**
 * One node-add pill button (Mesh/Image/Shader/Output) — category-colored
 * tile + name. Pill variant of AppToolbar.tsx's PaletteButton (same
 * `.tb-tile` category-tile styling, different button chrome/class).
 */
function PillButton({
  name,
  glyph,
  category,
  onClick,
  disabled,
  title,
}: {
  name: string;
  glyph: string;
  category: keyof typeof tokens.nodeCategory;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const hex = tokens.nodeCategory[category];
  return (
    <button
      type="button"
      className="add-node-pill-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span
        className="tb-tile"
        aria-hidden="true"
        style={{
          background: withAlpha(hex, 0.16),
          border: `1px solid ${hex}`,
          color: hex,
        }}
      >
        {glyph}
      </span>
      {name}
    </button>
  );
}

/**
 * Floating add-node pill — Node Editor canvas top-center (W4, design/App
 * Shell.dc.html L130-137 + L855-860). Quick-access category buttons +
 * a `＋ More` overflow into the ⌘K CommandPalette (role split: pill = fast
 * 1-click access to the 4 common kinds, palette = full search including
 * Webcam/Video/Audio/Blend/Param and everything else).
 *
 * Category actions follow CommandPalette's pattern (src/ui/CommandPalette/
 * index.tsx) — addNode via useGraphStore.getState() at click time, then
 * useSelectionStore.getState().select(id) so the new node becomes the
 * active selection (Inspector/CodeEditor focus, W5 auto-code, etc.).
 */
export function AddNodePill() {
  const nodes = useGraphStore((s) => s.nodes);
  const outputsFull =
    nodes.filter((n) => n.kind === "output").length >= MAX_OUTPUTS;

  const addMesh = () => {
    const id = nextId("mesh");
    useGraphStore
      .getState()
      .addNode({ id, kind: "mesh", primitive: "sphere" }, { x: -200, y: 0 });
    useSelectionStore.getState().select(id);
  };

  const addImage = () => {
    const id = nextId("image");
    useGraphStore
      .getState()
      .addNode({ id, kind: "image", assetId: null }, { x: -200, y: 200 });
    useSelectionStore.getState().select(id);
  };

  // [C-7] Starter template, not unlit — a node added here has no mesh input,
  // so it compiles against fullscreen.vert (v_uv only) and unlit.frag's
  // `in vec3 v_normal` could never link on its first frame. See starter.frag.
  // (Reason carried over from AppToolbar.tsx's addShader — same starter
  // choice applies here.)
  const addShader = () => {
    const id = nextId("shader");
    const node: GraphNode = {
      id,
      kind: "shader",
      vertexSource: basicVert,
      fragmentSource: starterFrag,
      // C-2: no hardcoded seed values — the initial glow color comes from
      // starter.frag's `@default` hint, bound by compile.ts's
      // withExplicitDefaults at compile time.
      uniformValues: {},
    };
    useGraphStore.getState().addNode(node, { x: 100, y: 0 });
    useSelectionStore.getState().select(id);
  };

  const addOutput = () => {
    if (outputsFull) return;
    const id = nextId("output");
    useGraphStore.getState().addNode({ id, kind: "output" }, { x: 400, y: 0 });
    useSelectionStore.getState().select(id);
  };

  return (
    <div className="add-node-pill" data-testid="add-node-pill">
      <PillButton name="Mesh" glyph="▣" category="source" onClick={addMesh} />
      <PillButton name="Image" glyph="▤" category="source" onClick={addImage} />
      <PillButton
        name="Shader"
        glyph="◆"
        category="process"
        onClick={addShader}
      />
      <PillButton
        name="Output"
        glyph="◎"
        category="output"
        onClick={addOutput}
        disabled={outputsFull}
        title={`Up to ${MAX_OUTPUTS} outputs (split viewport)`}
      />
      <div className="add-node-pill-divider" />
      <button
        type="button"
        className="add-node-pill-btn add-node-pill-btn--more"
        onClick={() => useCommandPaletteStore.getState().setOpen(true)}
      >
        ＋ More
      </button>
    </div>
  );
}

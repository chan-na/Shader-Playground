import { useRef } from "react";
import type { GraphNode, ParamKind } from "../../core/graph/types";
import { MAX_OUTPUTS } from "../../core/graph/validate";
import { downloadExportedHtml } from "../../export/htmlExport";
import basicVert from "../../shaders/basic.vert?raw";
import blendFrag from "../../shaders/templates/blend.frag?raw";
import unlitFrag from "../../shaders/templates/unlit.frag?raw";
import { hydrateAssetsFor, importFiles } from "../../state/assetActions";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  SPLIT_DEMO_LAYOUT,
  TORUS_DEMO_LAYOUT,
} from "../../state/demoGraph";
import { useGraphStore } from "../../state/graphStore";
import { useRecorderStore } from "../../state/recorder";
import {
  deserializeProject,
  serializeProject,
} from "../../state/serialization";
import { encodeShareUrl } from "../../state/shareUrl";
import { nextId } from "../../utils/id";

const btn: React.CSSProperties = {
  background: "#3a3a3d",
  border: "1px solid #555",
  color: "#ddd",
  padding: "4px 8px",
  cursor: "pointer",
  borderRadius: 3,
  fontSize: 11,
};

export function Toolbar() {
  const addNode = useGraphStore((s) => s.addNode);
  const setGraph = useGraphStore((s) => s.setGraph);
  const reset = useGraphStore((s) => s.reset);
  const nodes = useGraphStore((s) => s.nodes);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const outputCount = nodes.filter((n) => n.kind === "output").length;
  const outputsFull = outputCount >= MAX_OUTPUTS;

  const onPickFiles = () => fileInputRef.current?.click();
  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      void importFiles(files);
    }
    // Reset so the same file can be re-imported.
    e.target.value = "";
  };

  const exportProject = () => {
    const s = useGraphStore.getState();
    const project = serializeProject(
      { nodes: s.nodes, edges: s.edges },
      s.positions,
    );
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shader-playground-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onPickProject = () => projectInputRef.current?.click();
  const onProjectChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = deserializeProject(JSON.parse(text));
      setGraph(parsed.graph, parsed.positions);
      const meshIds: string[] = [];
      const imageIds: string[] = [];
      for (const n of parsed.graph.nodes) {
        if (n.kind === "mesh" && n.assetId) meshIds.push(n.assetId);
        if (n.kind === "image" && n.assetId) imageIds.push(n.assetId);
      }
      if (meshIds.length || imageIds.length) {
        void hydrateAssetsFor({ meshes: meshIds, images: imageIds });
      }
      if (parsed.warnings.length) {
        console.warn("Project loaded with warnings:", parsed.warnings);
      }
    } catch (err) {
      alert(`Failed to load project: ${(err as Error).message}`);
    }
  };

  const screenshot = () => {
    const canvas = document.querySelector(
      ".viewport-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shader-playground-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const shareUrl = async () => {
    const s = useGraphStore.getState();
    const url = await encodeShareUrl(
      { nodes: s.nodes, edges: s.edges },
      s.positions,
    );
    try {
      await navigator.clipboard.writeText(url);
      alert(`Share URL copied to clipboard\n${url.length} chars`);
    } catch {
      window.prompt("Copy this share URL:", url);
    }
  };

  const exportHtml = () => {
    const s = useGraphStore.getState();
    downloadExportedHtml({ nodes: s.nodes, edges: s.edges }, s.positions);
  };

  const recorderStatus = useRecorderStore((r) => r.status);
  const recorderUrl = useRecorderStore((r) => r.lastBlobUrl);

  const toggleRecord = async () => {
    const r = useRecorderStore.getState();
    const canvas = document.querySelector(
      ".viewport-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    if (r.status === "idle") {
      await r.start(canvas, 30);
    } else {
      const blob = await r.stop();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shader-playground-${Date.now()}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  };
  void recorderUrl;

  const addMesh = () => {
    const id = nextId("mesh");
    addNode({ id, kind: "mesh", primitive: "sphere" }, { x: -200, y: 0 });
  };
  const addImage = () => {
    const id = nextId("image");
    addNode({ id, kind: "image", assetId: null }, { x: -200, y: 200 });
  };
  const addShader = () => {
    const id = nextId("shader");
    const node: GraphNode = {
      id,
      kind: "shader",
      vertexSource: basicVert,
      fragmentSource: unlitFrag,
      uniformValues: { u_baseColor: [0.5, 0.7, 1.0] },
    };
    addNode(node, { x: 100, y: 0 });
  };
  const addOutput = () => {
    if (outputsFull) return;
    const id = nextId("output");
    addNode({ id, kind: "output" }, { x: 400, y: 0 });
  };
  const addParam = (paramKind: ParamKind) => {
    const id = nextId(`param-${paramKind}`);
    const value: number | number[] =
      paramKind === "float"
        ? 0.5
        : paramKind === "time"
          ? [1, 0]
          : paramKind === "color"
            ? [1, 0.5, 0.2]
            : [0, 0, 0];
    addNode({ id, kind: "param", paramKind, value }, { x: -240, y: 240 });
  };
  const addBlend = () => {
    const id = nextId("blend");
    const node: GraphNode = {
      id,
      kind: "shader",
      vertexSource: basicVert,
      fragmentSource: blendFrag,
      uniformValues: { u_mix: 0.5, u_mode: 0 },
    };
    addNode(node, { x: 200, y: 200 });
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: 6,
        borderBottom: "1px solid #1a1a1a",
        background: "#252526",
        flexWrap: "wrap",
      }}
    >
      <button type="button" style={btn} onClick={addMesh}>
        + Mesh
      </button>
      <button type="button" style={btn} onClick={addImage}>
        + Image
      </button>
      <button type="button" style={btn} onClick={addShader}>
        + Shader
      </button>
      <button
        type="button"
        style={btn}
        onClick={addBlend}
        title="Two-input blend/composite shader"
      >
        + Blend
      </button>
      <button
        type="button"
        style={btn}
        onClick={addOutput}
        disabled={outputsFull}
        title={`Up to ${MAX_OUTPUTS} outputs (split viewport)`}
      >
        + Output{outputCount > 0 ? ` (${outputCount}/${MAX_OUTPUTS})` : ""}
      </button>
      <button type="button" style={btn} onClick={() => addParam("float")}>
        + Float
      </button>
      <button type="button" style={btn} onClick={() => addParam("color")}>
        + Color
      </button>
      <button type="button" style={btn} onClick={() => addParam("time")}>
        + Time
      </button>
      <button
        type="button"
        style={btn}
        onClick={onPickFiles}
        title="Import OBJ/GLTF/PNG/JPG"
      >
        ↑ Load…
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.gltf,.glb,image/*"
        multiple
        style={{ display: "none" }}
        onChange={onFilesChosen}
      />
      <button
        type="button"
        style={btn}
        onClick={exportProject}
        title="Save graph as JSON"
      >
        ⬇ Export
      </button>
      <button
        type="button"
        style={btn}
        onClick={onPickProject}
        title="Load graph from JSON"
      >
        ⬆ Import
      </button>
      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={onProjectChosen}
      />
      <button
        type="button"
        style={btn}
        onClick={screenshot}
        title="Save viewport PNG"
      >
        📷 Snap
      </button>
      <button
        type="button"
        style={{
          ...btn,
          background:
            recorderStatus === "recording" ? "#5c1a1a" : btn.background,
          color: recorderStatus === "recording" ? "#ff8484" : btn.color,
        }}
        onClick={toggleRecord}
        title="Record viewport to WebM"
      >
        {recorderStatus === "recording" ? "■ Stop" : "● Record"}
      </button>
      <button
        type="button"
        style={btn}
        onClick={shareUrl}
        title="Copy a shareable URL to clipboard"
      >
        🔗 Share
      </button>
      <button
        type="button"
        style={btn}
        onClick={exportHtml}
        title="Download a self-contained HTML file"
      >
        📄 HTML
      </button>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        style={btn}
        onClick={() => setGraph(createDemoGraph(), DEMO_LAYOUT)}
      >
        Sphere
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT)}
      >
        Torus UV
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT)}
      >
        Chain
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT)}
      >
        Split
      </button>
      <button type="button" style={btn} onClick={() => reset()}>
        Clear
      </button>
    </div>
  );
}

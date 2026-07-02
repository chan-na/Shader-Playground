import { useRef } from "react";
import type { GraphNode, ParamKind } from "../../core/graph/types";
import { MAX_OUTPUTS } from "../../core/graph/validate";
import { downloadExportedHtml } from "../../export/htmlExport";
import basicVert from "../../shaders/basic.vert?raw";
import blendFrag from "../../shaders/templates/blend.frag?raw";
import unlitFrag from "../../shaders/templates/unlit.frag?raw";
import { hydrateGraphAssets, importFiles } from "../../state/assetActions";
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
import { useGifRecorderStore } from "../../state/gifRecorder";
import { useGraphStore } from "../../state/graphStore";
import { useRecorderStore } from "../../state/recorder";
import {
  deserializeProject,
  serializeProject,
} from "../../state/serialization";
import { encodeShareUrl } from "../../state/shareUrl";
import { toast } from "../../state/toastStore";
import { nextId } from "../../utils/id";
import { useHelpModalStore } from "./HelpModal";

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
      s.parents,
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
      setGraph(parsed.graph, parsed.positions, parsed.parents);
      hydrateGraphAssets(parsed.graph.nodes);
      if (parsed.warnings.length) {
        console.warn("Project loaded with warnings:", parsed.warnings);
      }
    } catch (err) {
      toast.error(`프로젝트 로드 실패: ${(err as Error).message}`);
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
      toast.success(`Share URL 복사됨 · ${url.length} chars`);
    } catch {
      window.prompt("Copy this share URL:", url);
    }
  };

  const exportHtml = () => {
    const s = useGraphStore.getState();
    downloadExportedHtml({ nodes: s.nodes, edges: s.edges }, s.positions);
  };

  const recorderStatus = useRecorderStore((r) => r.status);

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

  const gifStatus = useGifRecorderStore((r) => r.status);
  const gifEncodeProgress = useGifRecorderStore((r) => r.encodeProgress);
  const toggleGif = async () => {
    const g = useGifRecorderStore.getState();
    const canvas = document.querySelector(
      ".viewport-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    if (g.status === "idle") {
      g.start();
    } else if (g.status === "recording") {
      const blob = await g.stop();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shader-playground-${Date.now()}.gif`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  };

  const addMesh = () => {
    const id = nextId("mesh");
    addNode({ id, kind: "mesh", primitive: "sphere" }, { x: -200, y: 0 });
  };
  const addImage = () => {
    const id = nextId("image");
    addNode({ id, kind: "image", assetId: null }, { x: -200, y: 200 });
  };
  const addWebcam = () => {
    const id = nextId("webcam");
    addNode({ id, kind: "webcam" }, { x: -200, y: 320 });
  };
  const addVideo = () => {
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
  };
  const addAudio = () => {
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
      <button
        type="button"
        style={btn}
        onClick={addWebcam}
        title="Live camera texture (requires permission)"
      >
        + Webcam
      </button>
      <button
        type="button"
        style={btn}
        onClick={addVideo}
        title="Video file as a live texture (import via AssetBrowser)"
      >
        + Video
      </button>
      <button
        type="button"
        style={btn}
        onClick={addAudio}
        title="Microphone or audio file → FFT bin texture"
      >
        + Audio
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
        title="Import OBJ/GLTF/PNG/JPG/MP4/WebM/MP3/WAV"
        aria-label="Import OBJ, GLTF, image, video, or audio files"
      >
        <span aria-hidden="true">↑ </span>Load…
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.gltf,.glb,image/*,video/*,.mp4,.webm,.mov,.ogv,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        multiple
        style={{ display: "none" }}
        onChange={onFilesChosen}
      />
      <button
        type="button"
        style={btn}
        onClick={exportProject}
        title="Save graph as JSON"
        aria-label="Export project as JSON"
      >
        <span aria-hidden="true">⬇ </span>Export
      </button>
      <button
        type="button"
        style={btn}
        onClick={onPickProject}
        title="Load graph from JSON"
        aria-label="Import project from JSON"
      >
        <span aria-hidden="true">⬆ </span>Import
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
        aria-label="Save viewport as PNG"
      >
        <span aria-hidden="true">📷 </span>Snap
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
        aria-label={
          recorderStatus === "recording"
            ? "Stop recording viewport"
            : "Start recording viewport to WebM"
        }
      >
        {recorderStatus === "recording" ? (
          <>
            <span aria-hidden="true">■ </span>Stop
          </>
        ) : (
          <>
            <span aria-hidden="true">● </span>Record
          </>
        )}
      </button>
      <button
        type="button"
        style={{
          ...btn,
          background: gifStatus !== "idle" ? "#5c1a1a" : btn.background,
          color: gifStatus !== "idle" ? "#ff8484" : btn.color,
        }}
        onClick={toggleGif}
        disabled={gifStatus === "encoding"}
        title="Record viewport to animated GIF"
        aria-label={
          gifStatus === "recording"
            ? "Stop GIF recording"
            : gifStatus === "encoding"
              ? "Encoding GIF"
              : "Start recording viewport to animated GIF"
        }
      >
        {gifStatus === "recording" ? (
          <>
            <span aria-hidden="true">■ </span>GIF
          </>
        ) : gifStatus === "encoding" ? (
          <>
            <span aria-hidden="true">⏳ </span>
            {Math.round(gifEncodeProgress * 100)}%
          </>
        ) : (
          <>
            <span aria-hidden="true">● </span>GIF
          </>
        )}
      </button>
      <button
        type="button"
        style={btn}
        onClick={shareUrl}
        title="Copy a shareable URL to clipboard"
        aria-label="Copy shareable URL to clipboard"
      >
        <span aria-hidden="true">🔗 </span>Share
      </button>
      <button
        type="button"
        style={btn}
        onClick={exportHtml}
        title="Download a self-contained HTML file"
        aria-label="Download as self-contained HTML"
      >
        <span aria-hidden="true">📄 </span>HTML
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
      <button
        type="button"
        style={btn}
        onClick={() => useHelpModalStore.getState().toggle()}
        title="단축키 · 제스쳐 도움말"
        aria-label="Open help"
      >
        <span aria-hidden="true">? </span>Help
      </button>
    </div>
  );
}

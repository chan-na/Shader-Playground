import { useEffect, useRef, useState } from "react";
import type { GraphNode, ParamKind } from "../core/graph/types";
import { MAX_OUTPUTS } from "../core/graph/validate";
import { DEFAULT_EXPORT_BASE, exportFileName } from "../export/exportFileName";
import basicVert from "../shaders/basic.vert?raw";
import blendFrag from "../shaders/templates/blend.frag?raw";
import starterFrag from "../shaders/templates/starter.frag?raw";
import { hydrateGraphAssets, importFiles } from "../state/assetActions";
import { useCommandPaletteStore } from "../state/commandPaletteStore";
import {
  CHAIN_DEMO_LAYOUT,
  createChainDemoGraph,
  createDemoGraph,
  createSplitDemoGraph,
  createTorusDemoGraph,
  DEMO_LAYOUT,
  SPLIT_DEMO_LAYOUT,
  TORUS_DEMO_LAYOUT,
} from "../state/demoGraph";
import { useExportShareStore } from "../state/exportShareStore";
import { useGifRecorderStore } from "../state/gifRecorder";
import { redoGraph, undoGraph, useGraphStore } from "../state/graphStore";
import { useHistoryStore } from "../state/historyStore";
import { useRecorderStore } from "../state/recorder";
import { deserializeProject, serializeProject } from "../state/serialization";
import { toast } from "../state/toastStore";
import { tokens, withAlpha } from "../theme";
import { nextId } from "../utils/id";
import { useHelpModalStore } from "./NodeEditor/HelpModal";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);
const MOD_LABEL = isMac ? "⌘" : "Ctrl";

/** Brand mark box-shadow (App Shell.dc.html L33) — computed once, not per-render. */
const BRAND_SHADOW = `0 2px 8px ${withAlpha(tokens.accent.default, 0.35)}, inset 0 1px 0 ${withAlpha("#ffffff", 0.25)}`;
const BRAND_SQUARE_BORDER = `1.6px solid ${withAlpha("#ffffff", 0.92)}`;
const BRAND_DOT_BORDER = `1.4px solid ${withAlpha("#ffffff", 0.95)}`;

/**
 * Generic toolbar dropdown: a trigger button plus an absolutely-positioned
 * menu that closes on outside pointerdown or Escape. Not exported — used
 * only by AppToolbar's "+ More" and "Presets" triggers.
 */
function ToolbarMenu({
  label,
  children,
}: {
  label: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="tb-menu" ref={rootRef}>
      <button
        type="button"
        className="tb-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className="tb-menu-list" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** One node-add palette button (Mesh/Image/Shader/Output) — category-colored tile + name. */
function PaletteButton({
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
      className="tb-btn"
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

export function AppToolbar() {
  const addNode = useGraphStore((s) => s.addNode);
  const setGraph = useGraphStore((s) => s.setGraph);
  const reset = useGraphStore((s) => s.reset);
  const nodes = useGraphStore((s) => s.nodes);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const outputCount = nodes.filter((n) => n.kind === "output").length;
  const outputsFull = outputCount >= MAX_OUTPUTS;

  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

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
    a.download = exportFileName(DEFAULT_EXPORT_BASE, "json");
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
      a.download = exportFileName(DEFAULT_EXPORT_BASE, "png");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
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
        a.download = exportFileName(DEFAULT_EXPORT_BASE, "webm");
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
        a.download = exportFileName(DEFAULT_EXPORT_BASE, "gif");
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
  // [C-7] Starter template, not unlit — a node added here has no mesh input, so
  // it compiles against fullscreen.vert (v_uv only) and unlit.frag's
  // `in vec3 v_normal` could never link on its first frame. See starter.frag.
  const addShader = () => {
    const id = nextId("shader");
    const node: GraphNode = {
      id,
      kind: "shader",
      vertexSource: basicVert,
      fragmentSource: starterFrag,
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

  const gifActive = gifStatus !== "idle";
  const gifActiveStyle = gifActive
    ? {
        background: withAlpha(tokens.semantic.error, 0.16),
        borderColor: withAlpha(tokens.semantic.error, 0.5),
        color: tokens.semantic.error,
      }
    : undefined;

  return (
    <div className="app-toolbar">
      <div className="tb-brand">
        <div
          style={{
            position: "relative",
            width: 26,
            height: 26,
            borderRadius: "var(--radius-button)",
            background:
              "linear-gradient(155deg, var(--accent-default), var(--accent-active))",
            boxShadow: BRAND_SHADOW,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 6,
              width: 13,
              height: 13,
              borderRadius: 4,
              border: BRAND_SQUARE_BORDER,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 3,
              top: "50%",
              transform: "translateY(-50%)",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--surface-app)",
              border: BRAND_DOT_BORDER,
            }}
          />
        </div>
        <div className="tb-brand-word">
          <span style={{ color: "var(--text-primary)" }}>Shader</span>
          <span style={{ color: "var(--accent-default)" }}>Playground</span>
        </div>
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        <PaletteButton
          name="Mesh"
          glyph="▣"
          category="source"
          onClick={addMesh}
        />
        <PaletteButton
          name="Image"
          glyph="▤"
          category="source"
          onClick={addImage}
        />
        <PaletteButton
          name="Shader"
          glyph="◆"
          category="process"
          onClick={addShader}
        />
        <PaletteButton
          name="Output"
          glyph="◎"
          category="output"
          onClick={addOutput}
          disabled={outputsFull}
          title={`Up to ${MAX_OUTPUTS} outputs (split viewport)`}
        />
        <ToolbarMenu label="＋ More">
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addWebcam();
                  close();
                }}
                title="Live camera texture (requires permission)"
              >
                Webcam
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addVideo();
                  close();
                }}
                title="Video file as a live texture (import via AssetBrowser)"
              >
                Video
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addAudio();
                  close();
                }}
                title="Microphone or audio file → FFT bin texture"
              >
                Audio
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addBlend();
                  close();
                }}
                title="Two-input blend/composite shader"
              >
                Blend
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addParam("float");
                  close();
                }}
              >
                Float
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addParam("color");
                  close();
                }}
              >
                Color
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  addParam("time");
                  close();
                }}
              >
                Time
              </button>
              <div className="tb-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  onPickFiles();
                  close();
                }}
                title="Import OBJ/GLTF/PNG/JPG/MP4/WebM/MP3/WAV"
                aria-label="Import OBJ, GLTF, image, video, or audio files"
              >
                Load…
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  onPickProject();
                  close();
                }}
                title="Load graph from JSON"
                aria-label="Import project from JSON"
              >
                Import JSON
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  exportProject();
                  close();
                }}
                title="Save graph as JSON"
                aria-label="Export project as JSON"
              >
                Export JSON
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onClick={() => {
                  screenshot();
                  close();
                }}
                title="Save viewport PNG"
                aria-label="Save viewport as PNG"
              >
                Snap PNG
              </button>
            </>
          )}
        </ToolbarMenu>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.gltf,.glb,image/*,video/*,.mp4,.webm,.mov,.ogv,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        multiple
        style={{ display: "none" }}
        onChange={onFilesChosen}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={onProjectChosen}
      />

      <div className="tb-divider" />

      <ToolbarMenu
        label={
          <>
            Presets
            <span className="tb-caret" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        {(close) => (
          <>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setGraph(createDemoGraph(), DEMO_LAYOUT);
                close();
              }}
            >
              Sphere
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setGraph(createTorusDemoGraph(), TORUS_DEMO_LAYOUT);
                close();
              }}
            >
              Torus UV
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setGraph(createChainDemoGraph(), CHAIN_DEMO_LAYOUT);
                close();
              }}
            >
              Chain
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setGraph(createSplitDemoGraph(), SPLIT_DEMO_LAYOUT);
                close();
              }}
            >
              Split
            </button>
          </>
        )}
      </ToolbarMenu>

      <div className="tb-spacer" />

      <div className="tb-undo-group">
        <button
          type="button"
          className="tb-undo-btn"
          onClick={() => undoGraph()}
          disabled={!canUndo}
          aria-label="Undo"
          title={`Undo (${MOD_LABEL}Z)`}
        >
          ↶
        </button>
        <button
          type="button"
          className="tb-undo-btn"
          onClick={() => redoGraph()}
          disabled={!canRedo}
          aria-label="Redo"
          title={`Redo (${MOD_LABEL}⇧Z)`}
        >
          ↷
        </button>
      </div>

      <button
        type="button"
        className="tb-btn"
        onClick={toggleRecord}
        title="Record viewport to WebM"
        aria-label={
          recorderStatus === "recording"
            ? "Stop recording viewport"
            : "Start recording viewport to WebM"
        }
      >
        <span
          className="tb-dot"
          aria-hidden="true"
          style={
            recorderStatus === "recording"
              ? {
                  background: "var(--error)",
                  boxShadow: `0 0 6px ${withAlpha(tokens.semantic.error, 0.6)}`,
                }
              : { background: "var(--text-secondary)" }
          }
        />
        {recorderStatus === "recording" ? "Stop" : "Record"}
      </button>
      <button
        type="button"
        className="tb-btn"
        style={gifActiveStyle}
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

      <div className="tb-divider" />

      <button
        type="button"
        className="tb-btn"
        onClick={() => useExportShareStore.getState().openWith("link")}
        title="Open export & share dialog (share link)"
        aria-label="Open export & share dialog (share link)"
      >
        Share
      </button>
      <button
        type="button"
        className="tb-btn tb-btn--primary"
        onClick={() => useExportShareStore.getState().openWith("html")}
        title="Open export & share dialog (standalone HTML)"
        aria-label="Open export & share dialog (standalone HTML)"
      >
        Export HTML
      </button>

      <div className="tb-divider" />

      <button
        type="button"
        className="tb-btn tb-btn--muted"
        onClick={() => useCommandPaletteStore.getState().setOpen(true)}
      >
        Search
        <span className="tb-kbd" aria-hidden="true">
          ⌘K
        </span>
      </button>
      <button
        type="button"
        className="tb-btn tb-btn--muted"
        onClick={() => useHelpModalStore.getState().toggle()}
        title="단축키 · 제스쳐 도움말"
        aria-label="Open help"
      >
        ?
      </button>
      <button type="button" className="tb-btn" onClick={() => reset()}>
        Clear
      </button>
    </div>
  );
}

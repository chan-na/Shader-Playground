import { useCallback, useRef } from "react";
import type { GraphNode } from "../../core/graph/types";
import {
  forgetAudio,
  forgetImage,
  forgetMesh,
  forgetVideo,
  importFiles,
} from "../../state/assetActions";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { nextId } from "../../utils/id";

export function AssetBrowser() {
  const meshes = useAssetStore((s) => s.meshes);
  const images = useAssetStore((s) => s.images);
  const videos = useAssetStore((s) => s.videos);
  const audios = useAssetStore((s) => s.audios);
  const addNode = useGraphStore((s) => s.addNode);
  const select = useSelectionStore((s) => s.select);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const meshList = Object.values(meshes);
  const imageList = Object.values(images);
  const videoList = Object.values(videos);
  const audioList = Object.values(audios);

  const addMeshNodeFor = (assetId: string) => {
    const id = nextId("mesh");
    const node: GraphNode = { id, kind: "mesh", primitive: "cube", assetId };
    addNode(node, { x: -240, y: 0 });
    select(id);
  };

  const addImageNodeFor = (assetId: string) => {
    const id = nextId("image");
    const node: GraphNode = { id, kind: "image", assetId };
    addNode(node, { x: -240, y: 160 });
    select(id);
  };

  const addVideoNodeFor = (assetId: string) => {
    const id = nextId("video");
    const node: GraphNode = {
      id,
      kind: "video",
      assetId,
      playing: true,
      loop: true,
      muted: true,
    };
    addNode(node, { x: -240, y: 320 });
    select(id);
  };

  const addAudioNodeFor = (assetId: string) => {
    const id = nextId("audio");
    const node: GraphNode = {
      id,
      kind: "audio",
      sourceKind: "file",
      assetId,
      fftSize: 256,
      smoothing: 0.8,
      playing: true,
      loop: true,
    };
    addNode(node, { x: -240, y: 480 });
    select(id);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    // No position — AssetBrowser drops don't have a graph coordinate; the
    // resulting node falls back to the default offset.
    void importFiles(e.dataTransfer.files);
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: file drop zone; keyboard alternative is the Import button below
    <div
      className="panel-body"
      style={{ overflowY: "auto" }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="asset-browser-drop"
    >
      <div className="inspector-section">
        <div className="inspector-label">
          <span>Assets</span>
          <span style={{ color: "#666" }}>
            {meshList.length +
              imageList.length +
              videoList.length +
              audioList.length}
          </span>
        </div>
        <button
          type="button"
          className="btn-small"
          onClick={() => fileRef.current?.click()}
          title="Import OBJ / GLTF / images / videos / audio"
          aria-label="Import OBJ, GLTF, image, video, or audio files"
        >
          <span aria-hidden="true">↑ </span>Import file…
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".obj,.gltf,.glb,image/*,video/*,.mp4,.webm,.mov,.ogv,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files;
            if (f?.length) void importFiles(f);
            e.target.value = "";
          }}
        />
        <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>
          Drag &amp; drop files here or onto the graph.
        </div>
      </div>

      {imageList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Images ({imageList.length})</div>
          {imageList.map((img) => (
            <div key={img.id} className="asset-row">
              <ImageThumbnail
                bitmap={img.bitmap as ImageBitmap | HTMLImageElement | null}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#ddd",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {img.name}
                </div>
                <div
                  style={{
                    color: "#888",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  {img.width}×{img.height}
                </div>
              </div>
              <button
                type="button"
                className="btn-small"
                onClick={() => addImageNodeFor(img.id)}
                aria-label={`Add image node for ${img.name}`}
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => forgetImage(img.id)}
                title="Forget"
                aria-label={`Forget image ${img.name}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {meshList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Meshes ({meshList.length})</div>
          {meshList.map((m) => (
            <div key={m.id} className="asset-row">
              <div className="asset-mesh-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#ddd",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name}
                </div>
                <div
                  style={{
                    color: "#888",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  {m.data.indices
                    ? `${m.data.indices.length / 3} tri`
                    : `${m.data.vertexCount} vtx`}
                </div>
              </div>
              <button
                type="button"
                className="btn-small"
                onClick={() => addMeshNodeFor(m.id)}
                aria-label={`Add mesh node for ${m.name}`}
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => forgetMesh(m.id)}
                title="Forget"
                aria-label={`Forget mesh ${m.name}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {videoList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Videos ({videoList.length})</div>
          {videoList.map((v) => (
            <div key={v.id} className="asset-row">
              <div className="asset-image-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#ddd",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {v.name}
                </div>
                <div
                  style={{
                    color: "#888",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  {v.width}×{v.height} · {v.duration.toFixed(1)}s
                </div>
              </div>
              <button
                type="button"
                className="btn-small"
                onClick={() => addVideoNodeFor(v.id)}
                aria-label={`Add video node for ${v.name}`}
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => forgetVideo(v.id)}
                title="Forget"
                aria-label={`Forget video ${v.name}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {audioList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Audio ({audioList.length})</div>
          {audioList.map((a) => (
            <div key={a.id} className="asset-row">
              <div className="asset-image-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#ddd",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.name}
                </div>
                <div
                  style={{
                    color: "#888",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  {a.duration > 0 ? `${a.duration.toFixed(1)}s` : "—"}
                  {a.sampleRate > 0 ? ` · ${a.sampleRate}Hz` : ""}
                  {a.channels > 0 ? ` · ${a.channels}ch` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn-small"
                onClick={() => addAudioNodeFor(a.id)}
                aria-label={`Add audio node for ${a.name}`}
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => forgetAudio(a.id)}
                title="Forget"
                aria-label={`Forget audio ${a.name}`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {meshList.length === 0 &&
        imageList.length === 0 &&
        videoList.length === 0 &&
        audioList.length === 0 && (
          <div className="inspector-empty">No assets loaded</div>
        )}
    </div>
  );
}

function ImageThumbnail({
  bitmap,
}: {
  bitmap: ImageBitmap | HTMLImageElement | null;
}) {
  if (!bitmap) {
    return <div className="asset-image-icon" />;
  }
  // Use a small DOM canvas via ref for non-blocking draw. For simplicity here
  // we render via <img> when possible, else a placeholder. ImageBitmap can't
  // be set as <img src> directly; use a fresh canvas.
  return (
    <canvas
      ref={(c) => {
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        c.width = 32;
        c.height = 32;
        ctx.clearRect(0, 0, 32, 32);
        try {
          ctx.drawImage(bitmap as CanvasImageSource, 0, 0, 32, 32);
        } catch {
          /* ignore */
        }
      }}
      style={{ width: 32, height: 32, borderRadius: 2, background: "#1a1a1a" }}
    />
  );
}

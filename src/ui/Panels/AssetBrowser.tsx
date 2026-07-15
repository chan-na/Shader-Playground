import type { CSSProperties, ReactNode } from "react";
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
import { tokens, withAlpha } from "../../theme";
import { nextId } from "../../utils/id";
import { log, normalizeError } from "../../utils/log";

type AssetTag = "MESH" | "TEX" | "VID" | "AUD";

// design/Side Panel.dc.html L333-338: every asset tag uses the same purple
// (portFamily.resource) regardless of MESH/TEX/VID/AUD — the design doesn't
// differentiate tag color by kind, only the label text differs.
const ASSET_TAG_STYLE: CSSProperties = {
  color: tokens.portFamily.resource,
  background: withAlpha(tokens.portFamily.resource, 0.15),
  border: `1px solid ${withAlpha(tokens.portFamily.resource, 0.4)}`,
};

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

  const totalCount =
    meshList.length + imageList.length + videoList.length + audioList.length;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: file drop zone; keyboard alternative is the assets-dropzone button below (opens the same file picker)
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
          <span style={{ color: "var(--text-muted)" }}>{totalCount}</span>
        </div>
        <button
          type="button"
          className="assets-dropzone"
          onClick={() => fileRef.current?.click()}
          title="Import OBJ / GLTF / images / videos / audio"
          aria-label="Import OBJ, GLTF, image, video, or audio files"
        >
          <span aria-hidden="true" className="assets-dropzone-icon">
            ⤓
          </span>
          <span className="assets-dropzone-label">
            Drop mesh / image to import
          </span>
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
      </div>

      {imageList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Images ({imageList.length})</div>
          <div className="assets-grid">
            {imageList.map((img) => (
              <AssetCard
                key={img.id}
                tag="TEX"
                thumb={
                  <ImageThumbnail
                    bitmap={img.bitmap as ImageBitmap | HTMLImageElement | null}
                  />
                }
                name={img.name}
                meta={`${img.width}×${img.height}`}
                onAdd={() => addImageNodeFor(img.id)}
                addLabel={`Add image node for ${img.name}`}
                onForget={() => forgetImage(img.id)}
                forgetLabel={`Forget image ${img.name}`}
              />
            ))}
          </div>
        </div>
      )}

      {meshList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Meshes ({meshList.length})</div>
          <div className="assets-grid">
            {meshList.map((m) => (
              <AssetCard
                key={m.id}
                tag="MESH"
                thumb={<div className="assets-card-gradient" />}
                name={m.name}
                meta={
                  m.data.indices
                    ? `${m.data.indices.length / 3} tri`
                    : `${m.data.vertexCount} vtx`
                }
                onAdd={() => addMeshNodeFor(m.id)}
                addLabel={`Add mesh node for ${m.name}`}
                onForget={() => forgetMesh(m.id)}
                forgetLabel={`Forget mesh ${m.name}`}
              />
            ))}
          </div>
        </div>
      )}

      {videoList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Videos ({videoList.length})</div>
          <div className="assets-grid">
            {videoList.map((v) => (
              <AssetCard
                key={v.id}
                tag="VID"
                thumb={
                  <>
                    <div className="assets-card-gradient" />
                    <span className="assets-card-glyph" aria-hidden="true">
                      ▷
                    </span>
                  </>
                }
                name={v.name}
                meta={`${v.width}×${v.height} · ${v.duration.toFixed(1)}s`}
                onAdd={() => addVideoNodeFor(v.id)}
                addLabel={`Add video node for ${v.name}`}
                onForget={() => forgetVideo(v.id)}
                forgetLabel={`Forget video ${v.name}`}
              />
            ))}
          </div>
        </div>
      )}

      {audioList.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-label">Audio ({audioList.length})</div>
          <div className="assets-grid">
            {audioList.map((a) => (
              <AssetCard
                key={a.id}
                tag="AUD"
                thumb={
                  <>
                    <div className="assets-card-gradient" />
                    <span className="assets-card-glyph" aria-hidden="true">
                      ∿
                    </span>
                  </>
                }
                name={a.name}
                meta={`${a.duration > 0 ? `${a.duration.toFixed(1)}s` : "—"}${
                  a.sampleRate > 0 ? ` · ${a.sampleRate}Hz` : ""
                }${a.channels > 0 ? ` · ${a.channels}ch` : ""}`}
                onAdd={() => addAudioNodeFor(a.id)}
                addLabel={`Add audio node for ${a.name}`}
                onForget={() => forgetAudio(a.id)}
                forgetLabel={`Forget audio ${a.name}`}
              />
            ))}
          </div>
        </div>
      )}

      {totalCount === 0 && (
        <div className="inspector-empty">No assets loaded</div>
      )}
    </div>
  );
}

/**
 * design/Side Panel.dc.html L179-181: one 2-col grid cell — thumbnail (with
 * a top-left type tag) over a name/meta footer. The `＋` button is the
 * design's "add to graph" affordance; the `✕` forget button has no design
 * counterpart (Assets in the mock is read-only demo data) but is kept in the
 * footer's action slot so the existing forget-asset flow survives the
 * reskin. Not exported — this is AssetBrowser's private per-category card,
 * not a shared component.
 */
function AssetCard({
  tag,
  thumb,
  name,
  meta,
  onAdd,
  addLabel,
  onForget,
  forgetLabel,
}: {
  tag: AssetTag;
  thumb: ReactNode;
  name: string;
  meta: string;
  onAdd: () => void;
  addLabel: string;
  onForget: () => void;
  forgetLabel: string;
}) {
  return (
    <div className="assets-card">
      <div className="assets-card-thumb">
        {thumb}
        <span className="assets-card-tag" style={ASSET_TAG_STYLE}>
          {tag}
        </span>
      </div>
      <div className="assets-card-footer">
        <div className="assets-card-info">
          <div className="assets-card-name">{name}</div>
          <div className="assets-card-meta">{meta}</div>
        </div>
        <div className="assets-card-actions">
          <button
            type="button"
            className="assets-card-add"
            onClick={onAdd}
            aria-label={addLabel}
          >
            <span aria-hidden="true">＋</span>
          </button>
          <button
            type="button"
            className="assets-card-forget"
            onClick={onForget}
            title="Forget"
            aria-label={forgetLabel}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageThumbnail({
  bitmap,
}: {
  bitmap: ImageBitmap | HTMLImageElement | null;
}) {
  if (!bitmap) {
    return <div className="assets-card-gradient" />;
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
        c.width = 64;
        c.height = 64;
        ctx.clearRect(0, 0, 64, 64);
        try {
          ctx.drawImage(bitmap as CanvasImageSource, 0, 0, 64, 64);
        } catch (e) {
          log.debug("assets", "thumbnail drawImage failed", normalizeError(e));
        }
      }}
      style={{
        display: "block",
        width: "100%",
        height: 82,
        objectFit: "cover",
        imageRendering: "pixelated",
        background: "var(--surface-input)",
      }}
    />
  );
}

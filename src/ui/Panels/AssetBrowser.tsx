import { useRef } from "react";
import type { GraphNode } from "../../core/graph/types";
import { importFiles } from "../../state/assetActions";
import { useAssetStore } from "../../state/assetStore";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { nextId } from "../../utils/id";

export function AssetBrowser() {
  const meshes = useAssetStore((s) => s.meshes);
  const images = useAssetStore((s) => s.images);
  const removeMesh = useAssetStore((s) => s.removeMesh);
  const removeImage = useAssetStore((s) => s.removeImage);
  const addNode = useGraphStore((s) => s.addNode);
  const select = useSelectionStore((s) => s.select);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const meshList = Object.values(meshes);
  const imageList = Object.values(images);

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

  return (
    <div className="panel-body" style={{ overflowY: "auto" }}>
      <div className="inspector-section">
        <div className="inspector-label">
          <span>Assets</span>
          <span style={{ color: "#666" }}>
            {meshList.length + imageList.length}
          </span>
        </div>
        <button
          type="button"
          className="btn-small"
          onClick={() => fileRef.current?.click()}
          title="Import OBJ / GLTF / images"
        >
          ↑ Import file…
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".obj,.gltf,.glb,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files;
            if (f?.length) void importFiles(f);
            e.target.value = "";
          }}
        />
        <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>
          Drag &amp; drop also works on the graph.
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
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => removeImage(img.id)}
                title="Forget"
              >
                ✕
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
              >
                + Node
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => removeMesh(m.id)}
                title="Forget"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {meshList.length === 0 && imageList.length === 0 && (
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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeometryHandle, ImageHandle } from "../../core/assets/types";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { AssetBrowser } from "./AssetBrowser";

// The full module is mocked so forget*/importFiles never touch the real
// IndexedDB cache or file-import pipeline (those are covered by
// assetActions.test.ts) — this file only asserts that AssetBrowser wires the
// grid card's buttons/dropzone to the right calls.
vi.mock("../../state/assetActions", () => ({
  forgetMesh: vi.fn(),
  forgetImage: vi.fn(),
  forgetVideo: vi.fn(),
  forgetAudio: vi.fn(),
  importFiles: vi.fn(),
}));

import * as assetActions from "../../state/assetActions";
import { useAssetStore } from "../../state/assetStore";

const initialAssetState = useAssetStore.getState();

const meshHandle: GeometryHandle = {
  id: "mesh-fake-tri",
  name: "fake-triangle.obj",
  data: {
    attributes: [
      {
        name: "a_position",
        data: new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]),
        size: 3,
      },
    ],
    vertexCount: 3,
  },
};

const imageHandle: ImageHandle = {
  id: "img-fake",
  name: "fake-tex.png",
  width: 64,
  height: 32,
  bitmap: null,
};

function resetStores() {
  useAssetStore.setState(initialAssetState, true);
  useGraphStore.getState().reset();
  useSelectionStore.getState().select(null);
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  resetStores();
});

describe("AssetBrowser", () => {
  it("renders a mesh handle as a MESH card with name + vertex-count meta", () => {
    useAssetStore.getState().addMesh(meshHandle);
    render(<AssetBrowser />);

    expect(screen.getByText("fake-triangle.obj")).not.toBeNull();
    expect(screen.getByText("3 vtx", { exact: false })).not.toBeNull();
    expect(screen.getByText("MESH")).not.toBeNull();
  });

  it("renders an image handle (bitmap: null) as a TEX card with width×height meta", () => {
    useAssetStore.getState().addImage(imageHandle);
    render(<AssetBrowser />);

    expect(screen.getByText("fake-tex.png")).not.toBeNull();
    expect(screen.getByText("TEX")).not.toBeNull();
    expect(screen.getByText("64×32")).not.toBeNull();
  });

  it("clicking ＋ adds a mesh node to the graph and selects it", () => {
    useAssetStore.getState().addMesh(meshHandle);
    render(<AssetBrowser />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add mesh node for fake-triangle.obj",
      }),
    );

    const nodes = useGraphStore.getState().nodes;
    expect(
      nodes.some((n) => n.kind === "mesh" && n.assetId === "mesh-fake-tri"),
    ).toBe(true);
    expect(useSelectionStore.getState().selectedNodeId).not.toBeNull();
  });

  it("clicking ✕ calls assetActions.forgetMesh for that asset", () => {
    useAssetStore.getState().addMesh(meshHandle);
    render(<AssetBrowser />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Forget mesh fake-triangle.obj",
      }),
    );

    expect(assetActions.forgetMesh).toHaveBeenCalledWith("mesh-fake-tri");
  });

  it("clicking the dropzone triggers a click on the hidden file input", () => {
    const { container } = render(<AssetBrowser />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Import OBJ, GLTF, image, video, or audio files",
      }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no assets are loaded", () => {
    render(<AssetBrowser />);
    expect(screen.getByText("No assets loaded")).not.toBeNull();
  });
});

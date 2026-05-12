import { beforeEach, describe, expect, it } from "vitest";
import type { GeometryHandle, ImageHandle } from "../core/assets/types";
import { snapshotAssets, useAssetStore } from "./assetStore";

const mkMesh = (id: string): GeometryHandle => ({
  id,
  name: id,
  data: { attributes: [], vertexCount: 0 },
});

const mkImage = (id: string): ImageHandle => ({
  id,
  name: id,
  width: 1,
  height: 1,
  bitmap: null,
});

describe("assetStore", () => {
  beforeEach(() => {
    useAssetStore.setState({ meshes: {}, images: {}, rev: 0 });
  });

  it("addMesh stores by id and bumps rev", () => {
    const before = useAssetStore.getState().rev;
    useAssetStore.getState().addMesh(mkMesh("m1"));
    const s = useAssetStore.getState();
    expect(s.meshes.m1?.name).toBe("m1");
    expect(s.rev).toBe(before + 1);
  });

  it("addImage stores by id and bumps rev", () => {
    const before = useAssetStore.getState().rev;
    useAssetStore.getState().addImage(mkImage("i1"));
    const s = useAssetStore.getState();
    expect(s.images.i1?.width).toBe(1);
    expect(s.rev).toBe(before + 1);
  });

  it("addMesh on the same id replaces (rev still bumps each call)", () => {
    useAssetStore.getState().addMesh(mkMesh("m1"));
    const revAfterFirst = useAssetStore.getState().rev;
    useAssetStore.getState().addMesh({ ...mkMesh("m1"), name: "renamed" });
    expect(useAssetStore.getState().meshes.m1?.name).toBe("renamed");
    expect(useAssetStore.getState().rev).toBe(revAfterFirst + 1);
  });

  it("removeMesh deletes and bumps rev", () => {
    useAssetStore.getState().addMesh(mkMesh("m1"));
    useAssetStore.getState().addMesh(mkMesh("m2"));
    const revBefore = useAssetStore.getState().rev;
    useAssetStore.getState().removeMesh("m1");
    const s = useAssetStore.getState();
    expect(s.meshes.m1).toBeUndefined();
    expect(s.meshes.m2).toBeDefined();
    expect(s.rev).toBe(revBefore + 1);
  });

  it("removeImage deletes and bumps rev", () => {
    useAssetStore.getState().addImage(mkImage("i1"));
    const revBefore = useAssetStore.getState().rev;
    useAssetStore.getState().removeImage("i1");
    const s = useAssetStore.getState();
    expect(s.images.i1).toBeUndefined();
    expect(s.rev).toBe(revBefore + 1);
  });

  it("snapshotAssets returns current meshes and images by reference", () => {
    useAssetStore.getState().addMesh(mkMesh("m1"));
    useAssetStore.getState().addImage(mkImage("i1"));
    const snap = snapshotAssets();
    expect(Object.keys(snap.meshes)).toEqual(["m1"]);
    expect(Object.keys(snap.images)).toEqual(["i1"]);
  });
});

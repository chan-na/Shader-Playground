import { beforeEach, describe, expect, it } from "vitest";
import { useExportShareStore } from "./exportShareStore";

const initial = useExportShareStore.getState();

beforeEach(() => {
  useExportShareStore.setState(initial, true);
});

describe("exportShareStore", () => {
  it("starts closed with the default gif target", () => {
    expect(useExportShareStore.getState().open).toBe(false);
    expect(useExportShareStore.getState().target).toBe("gif");
  });

  it("openWith(target) opens the dialog and sets the target together", () => {
    useExportShareStore.getState().openWith("html");
    expect(useExportShareStore.getState().open).toBe(true);
    expect(useExportShareStore.getState().target).toBe("html");
  });

  it("openWith swaps target on a dialog that's already open", () => {
    useExportShareStore.getState().openWith("html");
    useExportShareStore.getState().openWith("link");
    expect(useExportShareStore.getState().open).toBe(true);
    expect(useExportShareStore.getState().target).toBe("link");
  });

  it("setTarget swaps the target without touching open", () => {
    useExportShareStore.getState().setTarget("webm");
    expect(useExportShareStore.getState().target).toBe("webm");
    expect(useExportShareStore.getState().open).toBe(false);

    useExportShareStore.getState().openWith("link");
    useExportShareStore.getState().setTarget("webm");
    expect(useExportShareStore.getState().target).toBe("webm");
    expect(useExportShareStore.getState().open).toBe(true);
  });

  it("close() sets open false without touching target", () => {
    useExportShareStore.getState().openWith("html");
    useExportShareStore.getState().close();
    expect(useExportShareStore.getState().open).toBe(false);
    expect(useExportShareStore.getState().target).toBe("html");
  });
});

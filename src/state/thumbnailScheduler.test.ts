import { describe, expect, it } from "vitest";
import { ThumbnailScheduler } from "../core/thumbnail/scheduler";
import { thumbnailScheduler } from "./thumbnailScheduler";

describe("thumbnailScheduler singleton", () => {
  it("exports a configured ThumbnailScheduler instance", () => {
    expect(thumbnailScheduler).toBeInstanceOf(ThumbnailScheduler);
  });
});

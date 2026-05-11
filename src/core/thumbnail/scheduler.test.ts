import { describe, expect, it } from "vitest";
import { ThumbnailScheduler } from "./scheduler";

const fakeImage = () => new ImageData(1, 1);

describe("ThumbnailScheduler", () => {
  it("subscribe immediately marks node as ready (forceNext)", () => {
    const s = new ThumbnailScheduler(10);
    s.subscribe("a", () => {});
    expect(s.pickReady(0)).toContain("a");
  });

  it("after commit, throttle gates next pickReady", () => {
    const s = new ThumbnailScheduler(10); // 100ms interval
    let last: ImageData | null = null;
    s.subscribe("a", (img) => {
      last = img;
    });
    s.commit("a", fakeImage(), 0);
    expect(last).not.toBeNull();
    expect(s.pickReady(50)).not.toContain("a");
    expect(s.pickReady(101)).toContain("a");
  });

  it("hidden nodes are not picked", () => {
    const s = new ThumbnailScheduler(10);
    s.subscribe("a", () => {});
    s.commit("a", fakeImage(), 0);
    s.setVisibility("a", false);
    expect(s.pickReady(1000)).not.toContain("a");
    s.setVisibility("a", true);
    expect(s.pickReady(1000)).toContain("a");
  });

  it("bump forces immediate update even within throttle window", () => {
    const s = new ThumbnailScheduler(10);
    s.subscribe("a", () => {});
    s.commit("a", fakeImage(), 0);
    expect(s.pickReady(10)).not.toContain("a");
    s.bump("a");
    expect(s.pickReady(10)).toContain("a");
  });

  it("bumpAll forces every subscribed node", () => {
    const s = new ThumbnailScheduler(10);
    s.subscribe("a", () => {});
    s.subscribe("b", () => {});
    s.commit("a", fakeImage(), 0);
    s.commit("b", fakeImage(), 0);
    s.bumpAll();
    const ready = s.pickReady(10);
    expect(ready).toContain("a");
    expect(ready).toContain("b");
  });

  it("unsubscribe removes the entry", () => {
    const s = new ThumbnailScheduler(10);
    const stop = s.subscribe("a", () => {});
    stop();
    expect(s.pickReady(1000)).not.toContain("a");
  });
});

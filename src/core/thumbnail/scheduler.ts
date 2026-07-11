export type ThumbnailListener = (image: ImageData) => void;

interface Entry {
  listener: ThumbnailListener;
  visible: boolean;
  /** time of last successful update (perf.now) */
  lastUpdate: number;
  /** if true, force an immediate update next tick (slider drag / code edit) */
  forceNext: boolean;
}

export class ThumbnailScheduler {
  private entries = new Map<string, Entry>();
  private intervalMs: number;

  constructor(hz = 10) {
    this.intervalMs = 1000 / hz;
  }

  subscribe(nodeId: string, listener: ThumbnailListener) {
    const cur = this.entries.get(nodeId);
    if (cur) {
      cur.listener = listener;
      return () => this.unsubscribe(nodeId);
    }
    this.entries.set(nodeId, {
      listener,
      visible: true,
      lastUpdate: 0,
      forceNext: true,
    });
    return () => this.unsubscribe(nodeId);
  }

  unsubscribe(nodeId: string) {
    this.entries.delete(nodeId);
  }

  setVisibility(nodeId: string, visible: boolean) {
    const e = this.entries.get(nodeId);
    if (!e) return;
    e.visible = visible;
  }

  /** Force the next readback for this node (slider drag / code edit). */
  bump(nodeId: string) {
    const e = this.entries.get(nodeId);
    if (e) e.forceNext = true;
  }

  /** Force-update all nodes (e.g., on graph reset). */
  bumpAll() {
    for (const e of this.entries.values()) e.forceNext = true;
  }

  /**
   * Returns the set of node IDs that should be readback this frame.
   * Caller is responsible for performing the readback and calling `commit`.
   */
  pickReady(now: number): string[] {
    const out: string[] = [];
    for (const [id, e] of this.entries) {
      if (!e.visible) continue;
      if (e.forceNext || now - e.lastUpdate >= this.intervalMs) {
        out.push(id);
      }
    }
    return out;
  }

  /**
   * Visible nodes flagged `forceNext` — i.e. that need a *first* (or explicitly
   * re-requested) capture, ignoring the throttle window entirely. Used by the
   * paused render loop to fill in a thumbnail for a card scrolled into view
   * while idle, without the 10Hz throttle re-issue `pickReady` would otherwise
   * drive on static content (which would keep the loop doing readback work when
   * it should stay idle). Once such a node is committed its `forceNext` clears,
   * so a static idle graph issues no further readback.
   */
  pickForced(): string[] {
    const out: string[] = [];
    for (const [id, e] of this.entries) {
      if (e.visible && e.forceNext) out.push(id);
    }
    return out;
  }

  commit(nodeId: string, image: ImageData, now: number) {
    const e = this.entries.get(nodeId);
    if (!e) return;
    e.lastUpdate = now;
    e.forceNext = false;
    e.listener(image);
  }
}

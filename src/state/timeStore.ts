import { create } from "zustand";

/**
 * Upper bound (seconds) on a single advance step. A backgrounded tab or a GC
 * pause makes the RAF delta balloon to seconds; without a cap simTime would
 * jump forward by the whole stalled interval on the next frame.
 */
const MAX_ADVANCE_DT = 0.1;

export interface TimeState {
  /** Simulated shader time in seconds — what u_time sees. */
  simTime: number;
  /** Wall-clock seconds elapsed since last advance (internal). */
  playing: boolean;
  speed: number;
  /**
   * Bumped on user-initiated time transitions (play/pause toggle, scrub, speed
   * change). RAF loop reads this to wake from idle when the user scrubs while
   * paused. `advance()` does NOT bump rev — that is the hot path.
   */
  rev: number;

  setPlaying: (p: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (s: number) => void;
  setTime: (t: number) => void;
  reset: () => void;
  /** Called from the RAF tick with the real wall-clock delta (seconds). */
  advance: (dt: number) => void;
}

export const useTimeStore = create<TimeState>((set, get) => ({
  simTime: 0,
  playing: true,
  speed: 1,
  rev: 0,
  setPlaying: (p) => set((s) => ({ playing: p, rev: s.rev + 1 })),
  togglePlaying: () => set((s) => ({ playing: !s.playing, rev: s.rev + 1 })),
  setSpeed: (sp) => set((s) => ({ speed: sp, rev: s.rev + 1 })),
  setTime: (t) => set((s) => ({ simTime: Math.max(0, t), rev: s.rev + 1 })),
  reset: () => set((s) => ({ simTime: 0, rev: s.rev + 1 })),
  advance: (dt) => {
    const { playing, speed, simTime } = get();
    if (!playing) return;
    const clamped = Math.min(Math.max(dt, 0), MAX_ADVANCE_DT);
    set({ simTime: simTime + clamped * speed });
  },
}));

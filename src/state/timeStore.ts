import { create } from 'zustand';

export interface TimeState {
  /** Simulated shader time in seconds — what u_time sees. */
  simTime: number;
  /** Wall-clock seconds elapsed since last advance (internal). */
  playing: boolean;
  speed: number;

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
  setPlaying: (p) => set({ playing: p }),
  togglePlaying: () => set({ playing: !get().playing }),
  setSpeed: (s) => set({ speed: s }),
  setTime: (t) => set({ simTime: Math.max(0, t) }),
  reset: () => set({ simTime: 0 }),
  advance: (dt) => {
    const { playing, speed, simTime } = get();
    if (!playing) return;
    set({ simTime: simTime + dt * speed });
  },
}));

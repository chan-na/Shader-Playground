import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss timeout in ms. `0` disables auto-dismiss. */
  durationMs: number;
}

interface ToastInput {
  kind?: ToastKind;
  message: string;
  durationMs?: number;
}

export interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION_BY_KIND: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 8000,
};

let _seq = 0;
function nextToastId(): string {
  _seq++;
  return `t${_seq}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (input) => {
    const id = nextToastId();
    const kind: ToastKind = input.kind ?? "info";
    const durationMs = input.durationMs ?? DEFAULT_DURATION_BY_KIND[kind];
    const toast: Toast = { id, kind, message: input.message, durationMs };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (durationMs > 0 && typeof setTimeout !== "undefined") {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, durationMs);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience wrappers — avoid `useToastStore.getState().push({...})` everywhere. */
export const toast = {
  info: (message: string, durationMs?: number) =>
    useToastStore
      .getState()
      .push(
        durationMs === undefined
          ? { kind: "info", message }
          : { kind: "info", message, durationMs },
      ),
  success: (message: string, durationMs?: number) =>
    useToastStore
      .getState()
      .push(
        durationMs === undefined
          ? { kind: "success", message }
          : { kind: "success", message, durationMs },
      ),
  warning: (message: string, durationMs?: number) =>
    useToastStore
      .getState()
      .push(
        durationMs === undefined
          ? { kind: "warning", message }
          : { kind: "warning", message, durationMs },
      ),
  error: (message: string, durationMs?: number) =>
    useToastStore
      .getState()
      .push(
        durationMs === undefined
          ? { kind: "error", message }
          : { kind: "error", message, durationMs },
      ),
};

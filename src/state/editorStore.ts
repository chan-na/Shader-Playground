import { create } from 'zustand';

export type ShaderStage = 'vertex' | 'fragment';

export interface JumpRequest {
  /** Bumped on every request so the editor can react even if line is identical. */
  rev: number;
  nodeId: string;
  stage: ShaderStage;
  line: number; // 1-indexed
  column?: number; // 1-indexed
}

export interface EditorState {
  activeStage: ShaderStage;
  setStage: (s: ShaderStage) => void;
  jumpRequest: JumpRequest | null;
  requestJump: (req: Omit<JumpRequest, 'rev'>) => void;
  clearJump: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeStage: 'fragment',
  setStage: (s) => set({ activeStage: s }),
  jumpRequest: null,
  requestJump: (req) =>
    set((s) => ({
      jumpRequest: {
        ...req,
        rev: (s.jumpRequest?.rev ?? 0) + 1,
      },
    })),
  clearJump: () => set({ jumpRequest: null }),
}));

import { create } from 'zustand';

export type ShaderStage = 'vertex' | 'fragment';

export interface EditorState {
  activeStage: ShaderStage;
  setStage: (s: ShaderStage) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeStage: 'fragment',
  setStage: (s) => set({ activeStage: s }),
}));

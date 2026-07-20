import { create } from "zustand";

export type ShaderStage = "vertex" | "fragment";

interface JumpRequest {
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
  requestJump: (req: Omit<JumpRequest, "rev">) => void;
  clearJump: () => void;
  /** W5(design/CHANGELOG.md §v2.0) — Code 자동 접기/펼침 게이트. ON(기본)이면
   * 노드 선택이 code leaf의 collapsed를 구동하고, OFF면 수동 chevron만
   * 유효하다. 비영속(리로드 시 기본 ON) — temp/design-followup-v2.0.md 참조. */
  autoCode: boolean;
  setAutoCode: (on: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeStage: "fragment",
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
  autoCode: true,
  setAutoCode: (on) => set({ autoCode: on }),
}));

/** W5 — 노드 선택 → Code 패널 자동 접기/펼침 배선.
 * 정본: design/CHANGELOG.md §v2.0 W5 + design/App Shell.dc.html
 * selectNode(L773-786). 상태머신: 빈 선택=현상 유지 · 선택에 code-editable
 * kind(shader|compute) 포함=펼침 · 미포함=접힘 · autoCode OFF=no-op.
 * compute 포함은 dc(shader만 존재)에 없는 구현 확장 — CodeEditor가 compute
 * 소스를 편집하므로(CodeEditor/index.tsx effectiveId 판정과 동일 집합)
 * 접으면 편집 대상이 숨는 모순을 피한다(temp/design-followup-v2.0.md). */
import { useDockStore } from "./dockStore";
import { useEditorStore } from "./editorStore";
import { useGraphStore } from "./graphStore";
import { useSelectionStore } from "./selectionStore";

export function startCodeAutoOpen(): () => void {
  return useSelectionStore.subscribe((state) => {
    const ids = state.selectedNodeIds;
    if (ids.length === 0) return; // 빈 선택 = 현상 유지 (W5)
    if (!useEditorStore.getState().autoCode) return; // OFF = 자동 구동 정지
    const nodes = useGraphStore.getState().nodes;
    const open = ids.some((id) => {
      const kind = nodes.find((n) => n.id === id)?.kind;
      return kind === "shader" || kind === "compute";
    });
    useDockStore.getState().setCollapsed("code", !open);
  });
}

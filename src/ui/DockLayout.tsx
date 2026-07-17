/**
 * 도킹 트리 재귀 flex 렌더러 — B2-U1. `App.tsx`의 하드코딩 4패널 마크업
 * (shell-main/shell-left/shell-right/shell-code + 스플리터 3개)을 대체한다.
 *
 * dc(`Docking Prototype.dc.html`)의 absolute 픽셀 배치 대신 **중첩 flex
 * 재귀**를 쓴다 — 이유: (1) 현행 CSS/셀렉터 계약(`.shell-left` 등) 보존,
 * (2) ResizeObserver 없이 픽셀 동치, (3) `dockTree.layoutDockTree`는 B4
 * 드래그 히트테스트용으로 별도 남는다. flex 수식 `${ratio} 1 0px`은 dc
 * `_layout`의 `aw=(w-D)*ratio`와 동치(playwright viewport 1440×900).
 *
 * ⚠ 패널 언마운트 금지 불변식: 접힘은 CSS(`.shell-slot--collapsed`)로,
 * 최대화는 형제에 `.shell-slot--hidden`으로만 표현한다 — display:none일
 * 뿐 컴포넌트는 항상 마운트 유지(WebGL/CodeMirror 보존). 트리 모양이 한
 * 세션 내 고정이므로(B2 스코프 — 재도킹 드래그는 B4) 재귀 위치가 안정적,
 * 즉 리사이즈/접기/최대화 어떤 조작에서도 React가 리마운트하지 않는다.
 */

import { useRef } from "react";
import { useDockStore } from "../state/dockStore";
import {
  DIVIDER_PX,
  type DockLeaf,
  type DockNode,
  type DockPath,
  type DockSplit,
  findLeafPath,
} from "../state/dockTree";
import { CodeEditor } from "./CodeEditor";
import {
  leafPanelKind,
  legacyLeafClass,
  splitChildFlex,
  splitterLabel,
} from "./dockLayoutModel";
import { DockLeafContext } from "./dockLeafContext";
import { NodeEditor } from "./NodeEditor";
import { SidePanel } from "./Panels/SidePanel";
import { Splitter } from "./Splitter";
import { Viewport } from "./Viewport";

/** 조건부 className을 공백으로 이어붙이는 최소 헬퍼(falsy는 생략). 이전
 * App.tsx의 동일 헬퍼를 이 파일로 복제(그 하드코딩 마크업은 사라졌으므로
 * 헬퍼 자체도 이 렌더러가 단독 소유). */
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** 도킹 레이아웃 루트. `App.tsx`의 `.shell-content` 안에서 하나만 렌더된다. */
export function DockLayout() {
  const tree = useDockStore((s) => s.tree);
  const maximized = useDockStore((s) => s.maximized);
  if (tree === null) return null; // B2에서는 도달 불가(닫기 UI 없음) — empty state는 B3
  const maxPath = maximized === null ? null : findLeafPath(tree, maximized);
  return (
    <DockNodeView
      node={tree}
      path={[]}
      flex="1"
      maxRemaining={maxPath}
      hidden={false}
    />
  );
}

interface DockNodeViewProps {
  node: DockNode;
  path: DockPath;
  flex: string;
  /** 루트에서 이 노드까지 온 나머지 최대화 경로. `null`이면 이 서브트리
   * 어디에도 최대화된 leaf가 없다는 뜻(또는 애초에 아무것도 최대화되지
   * 않음). */
  maxRemaining: DockPath | null;
  /** 조상 split이 이 서브트리를 최대화 때문에 숨기기로 정했는지. */
  hidden: boolean;
}

function DockNodeView({
  node,
  path,
  flex,
  maxRemaining,
  hidden,
}: DockNodeViewProps) {
  if (node.type === "leaf") {
    return <DockLeafView leaf={node} path={path} flex={flex} hidden={hidden} />;
  }
  return (
    <DockSplitView
      node={node}
      path={path}
      flex={flex}
      maxRemaining={maxRemaining}
      hidden={hidden}
    />
  );
}

interface DockSplitViewProps {
  node: DockSplit;
  path: DockPath;
  flex: string;
  maxRemaining: DockPath | null;
  hidden: boolean;
}

function DockSplitView({
  node,
  path,
  flex,
  maxRemaining,
  hidden,
}: DockSplitViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setDividerRatio = useDockStore((s) => s.setDividerRatio);
  const { a: aFlex, b: bFlex, showDivider } = splitChildFlex(node);
  const head = maxRemaining === null ? null : (maxRemaining[0] ?? null);
  const rest = maxRemaining === null ? null : maxRemaining.slice(1);

  const handleDelta = (deltaPx: number): void => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const span = (node.dir === "row" ? rect.width : rect.height) - DIVIDER_PX;
    if (span <= 0) return;
    setDividerRatio(path, node.ratio + deltaPx / span, rect.width, rect.height);
  };

  return (
    <div
      ref={ref}
      className={cx(
        "dock-split",
        node.dir === "row" ? "dock-split--row" : "dock-split--col",
        hidden && "shell-slot--hidden",
      )}
      style={{ flex }}
    >
      <DockNodeView
        node={node.a}
        path={[...path, "a"]}
        flex={head === "a" ? "1" : aFlex}
        maxRemaining={head === "a" ? rest : null}
        hidden={head === "b"}
      />
      {showDivider && (
        <Splitter
          orientation={node.dir === "row" ? "vertical" : "horizontal"}
          label={splitterLabel(node)}
          onDelta={handleDelta}
          className={cx(head !== null && "shell-slot--hidden")}
        />
      )}
      <DockNodeView
        node={node.b}
        path={[...path, "b"]}
        flex={head === "b" ? "1" : bFlex}
        maxRemaining={head === "b" ? rest : null}
        hidden={head === "a"}
      />
    </div>
  );
}

interface DockLeafViewProps {
  leaf: DockLeaf;
  path: DockPath;
  flex: string;
  hidden: boolean;
}

function DockLeafView({ leaf, path, flex, hidden }: DockLeafViewProps) {
  const kind = leafPanelKind(leaf);
  return (
    <div
      className={cx(
        "dock-leaf",
        legacyLeafClass(leaf) ?? undefined,
        leaf.collapsed === true && "shell-slot--collapsed",
        hidden && "shell-slot--hidden",
      )}
      style={{ flex }}
    >
      <DockLeafContext.Provider value={{ leafId: leaf.id, path }}>
        {kind === "nodeEditor" && <NodeEditor />}
        {kind === "viewport" && <Viewport />}
        {kind === "sidePanel" && <SidePanel />}
        {kind === "code" && <CodeEditor />}
      </DockLeafContext.Provider>
    </div>
  );
}

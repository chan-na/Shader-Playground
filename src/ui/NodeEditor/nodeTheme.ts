import type { GraphNodeKind, PortType } from "../../core/graph/types";
import { tokens } from "../../theme";

/**
 * Port = 형태(방향) × 색(타입 패밀리) 이중 인코딩의 색 절반.
 * design/README.md §도메인 규칙 / theme.ts의 portFamily·portTypeToFamily 참고.
 */
export type PortFamily = keyof typeof tokens.portFamily;

/**
 * PortType → PortFamily. `tokens.portTypeToFamily`는 `as const` 객체라 키가
 * PortType과 정확히 일치하므로 인덱싱 결과가 이미 리터럴 유니온으로 좁혀진다
 * (noUncheckedIndexedAccess는 인덱스 시그니처에만 적용되며, 여기서는 명시적
 * 키 집합이라 `| undefined`가 붙지 않는다 — 캐스팅 불필요).
 */
export function portFamilyOf(type: PortType): PortFamily {
  return tokens.portTypeToFamily[type];
}

/** PortType이 속한 패밀리의 hex 색. */
export function portFamilyHex(type: PortType): string {
  return tokens.portFamily[portFamilyOf(type)];
}

/**
 * GraphNodeKind → 노드 카테고리(헤더 그라디언트·미니맵 색 근거).
 * design/README.md §nodeCategory 매핑: Source=Mesh·Image·Webcam·Video·Audio /
 * Process=Shader·Compute / Output=Output / Value=Param·Math·Swizzle·Combine /
 * Container=Group.
 */
export const NODE_CATEGORY_OF: Record<
  GraphNodeKind,
  keyof typeof tokens.nodeCategory
> = {
  mesh: "source",
  image: "source",
  webcam: "source",
  video: "source",
  audio: "source",
  shader: "process",
  compute: "process",
  output: "output",
  param: "value",
  math: "value",
  swizzle: "value",
  combine: "value",
  group: "container",
};

/** GraphNodeKind가 속한 카테고리의 hex 색. */
export function categoryHexFor(kind: GraphNodeKind): string {
  return tokens.nodeCategory[NODE_CATEGORY_OF[kind]];
}

/**
 * 노드 카드 헤더 아이콘 박스에 그리는 유니코드 글리프.
 * design/Node Editor.dc.html L371-382 renderVals()의 `cats[].nodes[].glyph` 전수.
 */
export const NODE_GLYPH: Record<GraphNodeKind, string> = {
  mesh: "▣",
  image: "▤",
  webcam: "◉",
  video: "▷",
  audio: "∿",
  shader: "◆",
  compute: "⌗",
  output: "◎",
  param: "∙",
  math: "∑",
  swizzle: "⇄",
  combine: "⊕",
  group: "▢",
};

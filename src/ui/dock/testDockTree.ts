import type { DockNode, DockSplit } from "./tree";

/** 테스트 전용 narrowing 헬퍼 — split이 아니면 즉시 실패시켜 이후 접근을
 * 타입 단언 없이 안전하게 만든다. */
export function asSplit(node: DockNode): DockSplit {
  if (node.type !== "split") {
    throw new Error("expected a split node");
  }
  return node;
}

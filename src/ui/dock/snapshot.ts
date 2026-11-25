import {
  DOCK_PANEL_IDS,
  type DockLeaf,
  type DockNode,
  type DockPanelId,
  findLeafPath,
} from "./tree";

// ============================================================
// 레이아웃 스냅샷 영속화 검증 (R9, B6-U1)
// 정본: `design/CHANGELOG.md` §v1.4 R9 — "레이아웃 = 사용자 작업 환경 →
// localStorage에 저장, 프로젝트 `.json`은 미포함(마이그레이션 회피)". 이
// 절의 `sanitizeDockLayoutSnapshot`은 dc 이식이 아니라 그 결정을 뒷받침하는
// 구현 전용 방어 계층이다 — localStorage는 손상/구버전/수동 편집을 허용하는
// 신뢰 불가 입력이므로, 하이드레이션 전 반드시 이 함수를 거친다.
// ============================================================

/** localStorage에 저장/복원되는 도킹 레이아웃 스냅샷(R9). `tree: null`도
 * 유효한 사용자 상태다 — 모든 패널을 닫은 empty state 역시 보존 대상인
 * "사용자 작업 환경"이기 때문(위 절 머리의 R9 주석 참조). `autoSave.ts`의
 * `loadDockLayout`/`saveDockLayout`이 이 형태로 직렬화한다. */
export interface DockLayoutSnapshot {
  version: 2;
  tree: DockNode | null;
  maximized: string | null;
  nextLeafId: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isDockPanelId(v: unknown): v is DockPanelId {
  return (DOCK_PANEL_IDS as readonly string[]).includes(v as string);
}

/** 트리 전체에서 `l<숫자>` 패턴 leaf id의 최대 접미사를 찾는다(없으면 0).
 * `sanitizeDockLayoutSnapshot`의 `nextLeafId` 정규화가 재로드 후
 * `dockDetached`가 발급할 `l${nextLeafId}`이 기존 leaf id와 충돌하지 않도록
 * 이 값 + 1을 하한으로 쓴다(`dockStore.ts`의 `DockState.nextLeafId` 주석의 R9 준비 사항). */
function maxLeafIdSuffix(node: DockNode | null): number {
  if (node === null) return 0;
  if (node.type === "leaf") {
    const digits = /^l(\d+)$/.exec(node.id)?.[1];
    return digits === undefined ? 0 : Number(digits);
  }
  return Math.max(maxLeafIdSuffix(node.a), maxLeafIdSuffix(node.b));
}

/**
 * leaf 원시값을 검증해 새 `DockLeaf`로 재구성한다(잉여 프로퍼티 제거).
 * `leafIds`/`panelIds`는 호출 트리 전체에서 공유되는 누적 집합 — 이 leaf가
 * 유효하다고 확정된 시점에만 자신의 id/tabs를 추가해, 검증 실패 시 상위
 * 호출(`sanitizeDockNode`)이 그대로 `null`을 반환해도 오염되지 않는다.
 * 무효 조건 하나라도 걸리면 `null`(스펙: id 공백/전역 중복 · tabs 빈 배열·
 * 알 수 없는 탭 id·leaf 내부 중복·전역 중복 · active가 tabs 밖 ·
 * collapsed가 boolean이 아님).
 */
function sanitizeDockLeaf(
  raw: Record<string, unknown>,
  leafIds: Set<string>,
  panelIds: Set<DockPanelId>,
): DockLeaf | null {
  const { id, tabs, active, collapsed } = raw;
  if (typeof id !== "string" || id.length === 0) return null;
  if (leafIds.has(id)) return null;
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  const cleanTabs: DockPanelId[] = [];
  for (const t of tabs) {
    if (!isDockPanelId(t) || cleanTabs.includes(t) || panelIds.has(t)) {
      return null;
    }
    cleanTabs.push(t);
  }
  if (!isDockPanelId(active) || !cleanTabs.includes(active)) return null;
  if (collapsed !== undefined && typeof collapsed !== "boolean") return null;

  leafIds.add(id);
  for (const t of cleanTabs) panelIds.add(t);

  return {
    type: "leaf",
    id,
    tabs: cleanTabs,
    active,
    ...(typeof collapsed === "boolean" ? { collapsed } : {}),
  };
}

/**
 * 트리 노드(leaf 또는 split) 원시값을 재귀 검증해 새 `DockNode`로
 * 재구성한다. split은 `dir ∈ {"row","col"}` · `ratio`가 유한수이며
 * `0 < ratio < 1` · `a`/`b`가 재귀적으로 유효할 때만 통과한다. `type`이
 * `"leaf"`/`"split"` 외의 값이면(혹은 raw가 object가 아니면) `null`.
 */
function sanitizeDockNode(
  raw: unknown,
  leafIds: Set<string>,
  panelIds: Set<DockPanelId>,
): DockNode | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "leaf") return sanitizeDockLeaf(raw, leafIds, panelIds);
  if (raw.type !== "split") return null;

  const { dir, ratio, a, b } = raw;
  if (dir !== "row" && dir !== "col") return null;
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  if (!(ratio > 0 && ratio < 1)) return null;

  const sanitizedA = sanitizeDockNode(a, leafIds, panelIds);
  if (sanitizedA === null) return null;
  const sanitizedB = sanitizeDockNode(b, leafIds, panelIds);
  if (sanitizedB === null) return null;

  return { type: "split", dir, ratio, a: sanitizedA, b: sanitizedB };
}

/**
 * localStorage에서 읽은 원시값을 `DockLayoutSnapshot`으로 검증·정규화한다.
 * 정본: `design/CHANGELOG.md` §v1.4 R9. **하나라도 어긋나면 `null`** —
 * 호출측(`autoSave.ts`의 `loadDockLayout`)이 조용히 기본 트리로 폴백한다.
 *
 * V4(v2.0, 조용한 폴백): `version`이 `2`로 범프됐다 — 옛 `version:1`
 * 스냅샷(v1.x 트리 형태)은 이 게이트에서 즉시 `null`이 되어, 배너/경고 없이
 * `createDefaultDockTree()`(v2.0 트리)로 조용히 대체된다(CHANGELOG §v2.0 V4).
 *
 * 검증 순서:
 * 1. `raw`가 non-null object(배열 아님)이고 `version === 2`.
 * 2. `tree`: `null`이면 통과. 아니면 `sanitizeDockNode`로 재귀 검증 —
 *    실패 시 전체 무효.
 * 3. `maximized`: `null` 또는 `string`만 허용(다른 타입 → 전체 무효).
 *    string인데 트리에 그 leaf id가 없으면(`findLeafPath`가 `null`)
 *    **무효가 아니라 `null`로 정규화**한다 — `dockStore.ts`의
 *    `reconcileMaximized`와 동일한 관용 처리.
 * 4. `nextLeafId`: `Number.isInteger` && `>= 1`이 아니면 전체 무효. 유효하면
 *    트리의 최대 leaf id 접미사 + 1, 5, `raw.nextLeafId` 중 최댓값으로
 *    올려 정규화한다(재로드 후 `dockDetached`의 `l${nextLeafId}` 발급이
 *    기존 id와 충돌하지 않도록).
 *
 * 통과한 노드는 원시 파싱 객체를 그대로 쓰지 않고 새 객체로 재구성해
 * 반환한다(잉여 프로퍼티 제거 — 반환 스냅샷은 입력과 별개 참조).
 */
export function sanitizeDockLayoutSnapshot(
  raw: unknown,
): DockLayoutSnapshot | null {
  if (!isRecord(raw) || raw.version !== 2) return null;

  const leafIds = new Set<string>();
  const panelIds = new Set<DockPanelId>();
  let tree: DockNode | null = null;
  if (raw.tree !== null) {
    tree = sanitizeDockNode(raw.tree, leafIds, panelIds);
    if (tree === null) return null;
  }

  let maximized: string | null;
  if (raw.maximized === null) {
    maximized = null;
  } else if (typeof raw.maximized === "string") {
    maximized =
      findLeafPath(tree, raw.maximized) === null ? null : raw.maximized;
  } else {
    return null;
  }

  const rawNextLeafId = raw.nextLeafId;
  if (
    typeof rawNextLeafId !== "number" ||
    !Number.isInteger(rawNextLeafId) ||
    rawNextLeafId < 1
  ) {
    return null;
  }
  const nextLeafId = Math.max(maxLeafIdSuffix(tree) + 1, 5, rawNextLeafId);

  return { version: 2, tree, maximized, nextLeafId };
}

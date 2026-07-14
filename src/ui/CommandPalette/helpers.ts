/**
 * 대소문자 무시. 빈 query 는 1, substring 매치는 `100 - index` (앞쪽일수록 높음),
 * 그 외 subsequence (q 글자들이 순서대로 h 안에 나타남) 는 매치된 글자 수.
 * 어떤 매치도 안 되면 0.
 */
export function fuzzyMatch(haystack: string, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(q)) return 100 - h.indexOf(q);
  let qi = 0;
  let score = 0;
  for (let i = 0; i < h.length && qi < q.length; i++) {
    if (h[i] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

interface Searchable {
  label: string;
  keywords: string;
}

/**
 * 빈 query → 원본 그대로 반환. 그 외에는 `${label} ${keywords}` 로 fuzzyMatch
 * 점수를 매겨 0 점은 필터링, 높은 점수부터 정렬.
 */
export function rankCommands<T extends Searchable>(
  commands: readonly T[],
  query: string,
): T[] {
  if (!query) return commands.slice();
  return commands
    .map((c) => ({ c, s: fuzzyMatch(`${c.label} ${c.keywords}`, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

/** ArrowDown 클램핑: length 0 이면 0, 마지막 인덱스를 넘지 않음. */
export function nextActive(active: number, length: number): number {
  return Math.min(active + 1, Math.max(0, length - 1));
}

/** ArrowUp 클램핑: 0 미만으로 내려가지 않음. */
export function prevActive(active: number): number {
  return Math.max(active - 1, 0);
}

/** 커맨드 팔레트 결과의 그룹 종류. `PaletteMode`는 여기에 "all"(무필터)을 더한 것. */
export type CommandKind = "node" | "command" | "preset";

/** 검색창 prefix가 고르는 필터 모드. "all" = prefix 없음(무필터). */
export type PaletteMode = "all" | CommandKind;

/**
 * 쿼리 첫 글자로 모드를 판별한다 (dc.html renderVals L252-255):
 * `@`→node, `>`→command, `/`→preset, 그 외→all. prefix 문자만 제거하고
 * term은 그대로(트림/소문자화 없이) 반환 — 대소문자 무시·트림은 이미
 * fuzzyMatch/rankCommands 쪽에서 처리하므로 여기선 순수 prefix 파싱만 한다.
 */
export function parseMode(query: string): { mode: PaletteMode; term: string } {
  const first = query[0];
  if (first === "@") return { mode: "node", term: query.slice(1) };
  if (first === ">") return { mode: "command", term: query.slice(1) };
  if (first === "/") return { mode: "preset", term: query.slice(1) };
  return { mode: "all", term: query };
}

const PREFIX_CYCLE = ["", "@", ">", "/"] as const;

function prefixForMode(mode: PaletteMode): (typeof PREFIX_CYCLE)[number] {
  if (mode === "node") return "@";
  if (mode === "command") return ">";
  if (mode === "preset") return "/";
  return "";
}

/**
 * Tab 키용 모드 순환: ""→"@"→">"→"/"→"" 프리픽스를 한 단계 교체하고
 * term(프리픽스를 뗀 나머지 문자열)은 그대로 보존한다 (dc.html에는 없는,
 * 이 리스킨에서 새로 추가된 키보드 흐름).
 */
export function cycleModePrefix(query: string): string {
  const { mode, term } = parseMode(query);
  const currentIdx = PREFIX_CYCLE.indexOf(prefixForMode(mode));
  const nextIdx = (currentIdx + 1) % PREFIX_CYCLE.length;
  const nextPrefix = PREFIX_CYCLE[nextIdx] ?? "";
  return nextPrefix + term;
}

/** 라벨 한 글자를 fuzzy 매치 히트 여부로 색칠하기 위한 세그먼트. */
export interface FuzzySegment {
  text: string;
  hit: boolean;
}

/**
 * `label`에 대해 `term`을 subsequence로 매치한 글자 인덱스를 찾아 연속된
 * hit/non-hit 구간으로 나눈다 (dc.html fuzzy()/segs() L172-191 참조).
 * 매치 실패(term의 글자가 label 안에 순서대로 다 나타나지 않음) 시
 * `[{ text: label, hit: false }]`을 반환한다. 대소문자는 무시하지만
 * 반환하는 `text`는 항상 label의 원본 대소문자를 유지한다.
 */
export function fuzzySegments(label: string, term: string): FuzzySegment[] {
  const t = term.toLowerCase();
  const s = label.toLowerCase();
  let ti = 0;
  const hitIndices: number[] = [];
  for (let i = 0; i < s.length && ti < t.length; i++) {
    if (s[i] === t[ti]) {
      hitIndices.push(i);
      ti++;
    }
  }
  if (ti < t.length) {
    return [{ text: label, hit: false }];
  }
  const hitSet = new Set(hitIndices);
  const segments: FuzzySegment[] = [];
  for (let i = 0; i < label.length; i++) {
    const hit = hitSet.has(i);
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) {
      last.text += label[i];
    } else {
      segments.push({ text: label[i] ?? "", hit });
    }
  }
  return segments;
}

/** kind별 그룹 타이틀 (node → command → preset 고정 순서). */
const GROUP_ORDER: ReadonlyArray<{ kind: CommandKind; title: string }> = [
  { kind: "node", title: "Nodes" },
  { kind: "command", title: "Commands" },
  { kind: "preset", title: "Presets" },
];

export interface CommandGroup<T> {
  title: string;
  items: T[];
}

/**
 * 랭크된 결과를 kind별 그룹(Nodes → Commands → Presets 고정 순서)으로
 * 나눈다. 각 그룹 내부는 `ranked`의 상대 순서를 그대로 보존하고,
 * 항목이 없는 그룹은 결과 배열에서 제외한다.
 */
export function groupCommands<T extends { kind: CommandKind }>(
  ranked: readonly T[],
): CommandGroup<T>[] {
  return GROUP_ORDER.map(({ kind, title }) => ({
    title,
    items: ranked.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
}

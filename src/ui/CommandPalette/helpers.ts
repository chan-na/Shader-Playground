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

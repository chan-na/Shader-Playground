/**
 * Export 파일명 규칙 [D16] — design/README.md §H · Export & Share.dc.html L548-552.
 * `{projectTitle-slug}-{YYYYMMDD-HHMM}.{ext}` — 다운로드가 서로 덮어쓰지 않고,
 * 완료 카드/토스트 표시명 = 실제 저장명이 보장되도록 이름 생성을 한 곳으로 모은다.
 */
export const DEFAULT_EXPORT_BASE = "untitled-project"; // dc L549

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** dc L550의 "20260714-1532" 포맷 — 로컬 시간 YYYYMMDD-HHMM. */
function formatExportTimestamp(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

/** 사용자가 입력한 base를 파일시스템 안전 슬러그로 (dc의 "untitled-project" 스타일). */
function slugifyExportBase(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : DEFAULT_EXPORT_BASE;
}

export function exportFileName(
  base: string,
  ext: string,
  date: Date = new Date(),
): string {
  return `${slugifyExportBase(base)}-${formatExportTimestamp(date)}.${ext}`;
}

// 개발자용 런타임 로거. 토스트(사용자 알림)·diagnostics(GLSL 컴파일 에러)와
// 역할이 다르다 — 평소 비가시, 필요 시 콘솔/진단 패널에서 추적용으로 본다.
// 순환 의존성 방지를 위해 어떤 store도 import하지 않는다 (단방향 유지).

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "gl"
  | "render"
  | "graph"
  | "assets"
  | "external"
  | "autosave"
  | "app";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: unknown;
}

// 링버퍼 상한 — 메모리 누수 방지. 초과 시 가장 오래된 항목부터 evict.
const RING_CAPACITY = 500;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const buffer: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();

// 콘솔 미러링은 DEV에서만. 버퍼엔 레벨과 무관하게 항상 저장하고,
// 콘솔 출력만 minLevel로 게이트한다 (Debugging-Plan §3 P1 정책).
let minLevel: LogLevel = import.meta.env.DEV ? "debug" : "warn";

/** Error를 직렬화 가능한 평면 객체로 정규화한다. */
export function normalizeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

const CONSOLE_METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

function emit(
  level: LogLevel,
  category: LogCategory,
  message: string,
  detail?: unknown,
): void {
  const entry: LogEntry =
    detail === undefined
      ? { ts: Date.now(), level, category, message }
      : { ts: Date.now(), level, category, message, detail };

  buffer.push(entry);
  if (buffer.length > RING_CAPACITY) buffer.shift();

  for (const fn of subscribers) fn(entry);

  if (import.meta.env.DEV && LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel]) {
    const method = CONSOLE_METHOD[level];
    const tag = `[${category}]`;
    if (detail === undefined) console[method](tag, message);
    else console[method](tag, message, detail);
  }
}

export const log = {
  debug(category: LogCategory, message: string, detail?: unknown): void {
    emit("debug", category, message, detail);
  },
  info(category: LogCategory, message: string, detail?: unknown): void {
    emit("info", category, message, detail);
  },
  warn(category: LogCategory, message: string, detail?: unknown): void {
    emit("warn", category, message, detail);
  },
  error(category: LogCategory, message: string, detail?: unknown): void {
    emit("error", category, message, detail);
  },
};

export function getLogBuffer(): readonly LogEntry[] {
  return buffer;
}

export function subscribeLog(fn: (entry: LogEntry) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function clearLogBuffer(): void {
  buffer.length = 0;
}

export function setMinLevel(level: LogLevel): void {
  minLevel = level;
}

function formatDetail(detail: unknown): string {
  if (detail === undefined) return "";
  try {
    if (typeof detail === "string") return `\n  ${detail}`;
    return `\n  ${JSON.stringify(detail)}`;
  } catch {
    return `\n  ${String(detail)}`;
  }
}

export function exportLogText(): string {
  return buffer
    .map((e) => {
      const ts = new Date(e.ts).toISOString();
      return `[${ts}] ${e.level.toUpperCase()} ${e.category}: ${e.message}${formatDetail(e.detail)}`;
    })
    .join("\n");
}

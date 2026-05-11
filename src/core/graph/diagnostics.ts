export interface GLSLDiagnostic {
  line: number; // 1-indexed
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

// Common GPU vendor formats:
//   ERROR: 0:12: 'foo' : undeclared identifier
//   ERROR: 0:12:13: 'foo' : ...
//   0(12) : error C0000: ...
//   WARNING: 0:5: ...
const RE_COLON = /^(ERROR|WARNING|INFO):\s*(\d+):(\d+)(?::(\d+))?:\s*(.*)$/i;
const RE_PAREN = /^(\d+)\((\d+)\)\s*:\s*(error|warning|info)\b[^:]*:\s*(.*)$/i;

export function parseShaderInfoLog(log: string): GLSLDiagnostic[] {
  if (!log) return [];
  const out: GLSLDiagnostic[] = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let m = RE_COLON.exec(line);
    if (m) {
      const sev = m[1].toLowerCase() as GLSLDiagnostic['severity'];
      const lineNo = parseInt(m[3], 10);
      const colOrLine = m[4] ? parseInt(m[4], 10) : undefined;
      // Some drivers swap: ERROR: 0:line[:column]. column may be undefined.
      out.push({
        line: lineNo,
        column: colOrLine,
        severity: sev,
        message: m[5].trim(),
      });
      continue;
    }
    m = RE_PAREN.exec(line);
    if (m) {
      out.push({
        line: parseInt(m[2], 10),
        severity: m[3].toLowerCase() as GLSLDiagnostic['severity'],
        message: m[4].trim(),
      });
      continue;
    }
    // Fallback: keep as line-1 info so the user still sees it.
    out.push({ line: 1, severity: 'error', message: line });
  }
  return out;
}

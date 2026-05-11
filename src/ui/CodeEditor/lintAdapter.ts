import { type Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { GLSLDiagnostic } from '../../core/graph/diagnostics';

export function toCMDiagnostics(
  view: EditorView,
  diags: GLSLDiagnostic[],
): Diagnostic[] {
  const doc = view.state.doc;
  const out: Diagnostic[] = [];
  for (const d of diags) {
    const lineNo = Math.max(1, Math.min(doc.lines, d.line));
    const line = doc.line(lineNo);
    const from = d.column ? Math.min(line.to, line.from + Math.max(0, d.column - 1)) : line.from;
    const to = line.to;
    out.push({
      from,
      to,
      severity: d.severity === 'warning' ? 'warning' : d.severity === 'info' ? 'info' : 'error',
      message: d.message,
    });
  }
  return out;
}

import type { GLSLDiagnostic } from "../../core/graph/diagnostics";
import type { GraphNode } from "../../core/graph/types";
import type { NodeDiagnostics } from "../../state/diagnosticsStore";

/** One rendered row of the compile-error overlay's source excerpt. Not
 *  exported — CompileErrorOverlay.tsx only ever consumes it through
 *  `CompileErrorInfo['excerpt']`'s inferred element type. */
interface CompileErrorExcerptRow {
  lineNo: number;
  text: string;
  isError: boolean;
}

export interface CompileErrorInfo {
  nodeId: string;
  /** `${node.kind} · ${node.id}` — ProblemsPanel's nodeLabel convention. */
  title: string;
  stage: "vertex" | "fragment" | "link";
  /** 1-indexed source line, or null for link-stage failures (no single
   *  source line — a link failure is a whole-program symbol-resolution
   *  problem, not a per-line one). */
  line: number | null;
  message: string;
  raw: string;
  /** Total error-severity diagnostic count across all stages of this node. */
  errorCount: number;
  /** `line-2..line+1` window into the stage's source, clamped to bounds.
   *  Empty when `line` is null. */
  excerpt: CompileErrorExcerptRow[];
  /** Total number of shader nodes carrying an error-severity diagnostic
   *  [D19]. The overlay always reports a single failing node's count, but
   *  when this is 2 or more it appends "(+N-1 more)" to explain why that
   *  differs from the Status Bar's cross-node sum. */
  failingNodeCount: number;
}

// Lines before/after the error line included in the excerpt window (dc
// System States.dc.html L227-235 shows a 4-line window: line-2..line+1).
const EXCERPT_LINES_BEFORE = 2;
const EXCERPT_LINES_AFTER = 1;

/**
 * Re-synthesize a driver-log-shaped line from a parsed diagnostic, in the
 * same `SEVERITY: 0:line[:column]: message` shape `parseShaderInfoLog`
 * itself parses (see core/graph/diagnostics.ts's RE_COLON). The *original*
 * raw compiler text is discarded once it's split into structured
 * GLSLDiagnostic entries — diagnosticsStore only retains the parsed form —
 * so this is a best-effort reconstruction, good enough for the overlay's
 * read-only footer line and "Copy log" text.
 */
export function formatDiagnosticRaw(d: GLSLDiagnostic): string {
  const col = d.column !== undefined ? `:${d.column}` : "";
  return `${d.severity.toUpperCase()}: 0:${d.line}${col}: ${d.message}`;
}

function countErrors(diags: GLSLDiagnostic[]): number {
  return diags.filter((d) => d.severity === "error").length;
}

function firstError(diags: GLSLDiagnostic[]): GLSLDiagnostic | undefined {
  return diags.find((d) => d.severity === "error");
}

function buildExcerpt(source: string, line: number): CompileErrorExcerptRow[] {
  const lines = source.split(/\r?\n/);
  const total = lines.length;
  const start = Math.max(1, line - EXCERPT_LINES_BEFORE);
  const end = Math.min(total, line + EXCERPT_LINES_AFTER);
  const rows: CompileErrorExcerptRow[] = [];
  for (let lineNo = start; lineNo <= end; lineNo++) {
    rows.push({
      lineNo,
      text: lines[lineNo - 1] ?? "",
      isError: lineNo === line,
    });
  }
  return rows;
}

/**
 * Find the first shader node (in `nodes` order) carrying an error-severity
 * diagnostic, preferring vertex over fragment over link within that node
 * (dc System States.dc.html's compile-error overlay only ever surfaces one
 * failure at a time). Returns null when no shader node has an error-severity
 * diagnostic (warnings/info-only nodes are skipped entirely).
 */
export function firstCompileError(
  byNode: Record<string, NodeDiagnostics>,
  nodes: GraphNode[],
): CompileErrorInfo | null {
  let failingNodeCount = 0;
  for (const node of nodes) {
    if (node.kind !== "shader") continue;
    const d = byNode[node.id];
    if (!d) continue;
    if (
      countErrors(d.vertex) + countErrors(d.fragment) + countErrors(d.link) >
      0
    ) {
      failingNodeCount++;
    }
  }

  for (const node of nodes) {
    if (node.kind !== "shader") continue;
    const diags = byNode[node.id];
    if (!diags) continue;

    const errorCount =
      countErrors(diags.vertex) +
      countErrors(diags.fragment) +
      countErrors(diags.link);
    if (errorCount === 0) continue;

    const title = `${node.kind} · ${node.id}`;

    const vertexErr = firstError(diags.vertex);
    if (vertexErr) {
      return {
        nodeId: node.id,
        title,
        stage: "vertex",
        line: vertexErr.line,
        message: vertexErr.message,
        raw: formatDiagnosticRaw(vertexErr),
        errorCount,
        // The driver's line numbers index the source it was handed, which is
        // fullscreen.vert (not node.vertexSource) whenever the node compiled
        // as a fullscreen pass. Falling back to the node's own source is only
        // for diagnostics recorded before the compiler reported a source.
        excerpt: buildExcerpt(
          diags.compiledVertexSource ?? node.vertexSource,
          vertexErr.line,
        ),
        failingNodeCount,
      };
    }
    const fragmentErr = firstError(diags.fragment);
    if (fragmentErr) {
      return {
        nodeId: node.id,
        title,
        stage: "fragment",
        line: fragmentErr.line,
        message: fragmentErr.message,
        raw: formatDiagnosticRaw(fragmentErr),
        errorCount,
        excerpt: buildExcerpt(node.fragmentSource, fragmentErr.line),
        failingNodeCount,
      };
    }
    const linkErr = firstError(diags.link);
    if (linkErr) {
      return {
        nodeId: node.id,
        title,
        stage: "link",
        line: null,
        message: linkErr.message,
        raw: formatDiagnosticRaw(linkErr),
        errorCount,
        excerpt: [],
        failingNodeCount,
      };
    }
  }
  return null;
}

/**
 * CodeMirror 6 hover tooltip for GLSL editors (Phase 25).
 *
 * Resolves the identifier under the pointer in this order:
 *   1. Scope-aware document symbols from `buildSymbolTable` — locals,
 *      parameters, uniforms, functions, structs, etc. visible at the line
 *      the pointer lands on.
 *   2. Builtin function signatures + descriptions (`BUILTIN_FUNCTIONS`).
 *   3. System-uniform descriptions (`SYSTEM_UNIFORM_DESCRIPTIONS`) — caught
 *      via the symbol table for user-declared cases, here for the fallback
 *      where the source doesn't redeclare a known system name.
 *   4. GLSL keyword descriptions (`KEYWORD_DESCRIPTIONS`).
 *
 * Returns `null` (suppressing the tooltip) when nothing matches — we'd
 * rather show nothing than misleading info on a random word the user
 * paused over.
 */

import type { EditorView } from "@codemirror/view";
import { hoverTooltip, type Tooltip } from "@codemirror/view";
import {
  BUILTIN_FUNCTIONS,
  KEYWORD_DESCRIPTIONS,
} from "../../core/glsl/builtins";
import {
  buildSymbolTable,
  type GlslSymbol,
  resolveSymbol,
} from "../../core/glsl/symbolTable";
import { SYSTEM_UNIFORM_DESCRIPTIONS } from "../../core/graph/uniformParser";

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * Find the identifier word that contains `pos` (an offset within `line`),
 * returning the absolute document offsets `[from, to)` and the matched text.
 * Returns null when the position is between identifiers (whitespace, punct).
 */
export function identifierAt(
  lineText: string,
  lineFrom: number,
  pos: number,
): { from: number; to: number; word: string } | null {
  IDENT_RE.lastIndex = 0;
  const col = pos - lineFrom;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
  while ((m = IDENT_RE.exec(lineText)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    // Hovering at end-of-word (col === end) still counts as "on the word"
    // for the standard editor pointer feel.
    if (col >= start && col <= end) {
      return { from: lineFrom + start, to: lineFrom + end, word: m[0] };
    }
    if (start > col) break;
  }
  return null;
}

/** Pretty-print a symbol-table entry for display in the hover tooltip. */
export function formatSymbolHover(s: GlslSymbol): {
  signature: string;
  description?: string;
} {
  if (s.kind === "function") {
    return {
      signature: `${s.type} ${s.name}(${s.parameters ?? ""})`,
      description:
        s.scope === null
          ? "User-defined function."
          : `Local function in ${s.scope}.`,
    };
  }
  if (s.kind === "parameter") {
    return {
      signature: `${s.type} ${s.name}`,
      description: `Parameter of ${s.scope}().`,
    };
  }
  if (s.kind === "local") {
    return {
      signature: `${s.type} ${s.name}`,
      description: `Local in ${s.scope}().`,
    };
  }
  if (s.kind === "struct") {
    return {
      signature: `struct ${s.name}`,
      description: "User-defined struct.",
    };
  }
  // Storage-qualified globals: uniform / in / out / attribute / varying / const.
  const sysDesc =
    s.kind === "uniform" ? SYSTEM_UNIFORM_DESCRIPTIONS[s.name] : undefined;
  const out: { signature: string; description?: string } = {
    signature: `${s.kind} ${s.type} ${s.name}`,
  };
  // exactOptionalPropertyTypes: only set when defined.
  if (sysDesc !== undefined) out.description = sysDesc;
  return out;
}

/** Result of `lookupHover`, suitable for rendering. */
export interface HoverHit {
  signature: string;
  description?: string;
  /** Discriminator for callers that want to style differently. */
  source: "symbol" | "builtin" | "system-uniform" | "keyword";
}

/**
 * Resolve `word` to a hover hit using the symbol table for `source` and the
 * builtin catalogues for fallback. Visible for testing; the CM extension
 * below calls it via `identifierAt` on each hover.
 */
export function lookupHover(
  source: string,
  word: string,
  line: number,
): HoverHit | null {
  const table = buildSymbolTable(source);
  const sym = resolveSymbol(table, word, line);
  if (sym) {
    const f = formatSymbolHover(sym);
    const hit: HoverHit = { signature: f.signature, source: "symbol" };
    if (f.description !== undefined) hit.description = f.description;
    return hit;
  }
  const builtin = BUILTIN_FUNCTIONS[word];
  if (builtin) {
    return {
      signature: builtin.signatures.join("\n"),
      description: builtin.description,
      source: "builtin",
    };
  }
  const sysDesc = SYSTEM_UNIFORM_DESCRIPTIONS[word];
  if (sysDesc) {
    return {
      signature: `uniform ${word}`,
      description: sysDesc,
      source: "system-uniform",
    };
  }
  const kw = KEYWORD_DESCRIPTIONS[word];
  if (kw) {
    return { signature: word, description: kw, source: "keyword" };
  }
  return null;
}

/** Build the tooltip DOM. Plain divs styled by the existing `.cm-tooltip` rule. */
function renderHoverDom(hit: HoverHit): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-glsl-hover";
  root.setAttribute("data-source", hit.source);
  root.style.padding = "6px 8px";
  root.style.maxWidth = "420px";

  // Signature on top — monospace, slightly brighter than the description.
  const sig = document.createElement("div");
  sig.className = "cm-glsl-hover__sig";
  sig.style.fontFamily = "ui-monospace, SF Mono, Menlo, Consolas, monospace";
  sig.style.fontSize = "12px";
  sig.style.color = "#dcdcaa";
  sig.style.whiteSpace = "pre";
  sig.textContent = hit.signature;
  root.appendChild(sig);

  if (hit.description) {
    const desc = document.createElement("div");
    desc.className = "cm-glsl-hover__desc";
    desc.style.fontSize = "11px";
    desc.style.color = "#bbb";
    desc.style.marginTop = "4px";
    desc.textContent = hit.description;
    root.appendChild(desc);
  }
  return root;
}

/** CodeMirror extension factory. Mounted once per editor in `glslSetup.ts`. */
export function glslHoverTooltip() {
  return hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
    const lineObj = view.state.doc.lineAt(pos);
    const ident = identifierAt(lineObj.text, lineObj.from, pos);
    if (!ident) return null;
    const hit = lookupHover(
      view.state.doc.toString(),
      ident.word,
      lineObj.number,
    );
    if (!hit) return null;
    return {
      pos: ident.from,
      end: ident.to,
      above: true,
      create: () => ({ dom: renderHoverDom(hit) }),
    };
  });
}

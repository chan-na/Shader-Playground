/**
 * Comment masking for the GLSL editor tooling (L20).
 *
 * Every offset-sensitive GLSL consumer in this codebase (symbol table,
 * reference finder, semantic tokens, uniform parser, uniform-hint writer) used
 * to carry its own copy of a `/* … *\/` stripper plus a per-line `//` walk.
 * Four near-identical copies drifted: some masked, some truncated, and the
 * regex-based block strippers happily matched a `/*` that lived *inside* a
 * line comment, blanking real code that followed.
 *
 * This module owns the single scanner. It is a **leaf**: it imports nothing,
 * so no consumer can close an import cycle through it.
 *
 * ## Length preservation is a functional requirement
 *
 * Both masking entry points return a string with **exactly the same length**
 * as the input, and with `\n` / `\r` left in place. Callers convert per-line
 * regex match indices into absolute document offsets by advancing a running
 * `lineStart` cursor (`references.ts`, `semanticTokens.ts`), and those offsets
 * become CodeMirror edit ranges in `rename.ts`. A masker that shortened lines
 * would silently corrupt every rename.
 *
 * ## Two entry points, on purpose
 *
 * - {@link maskComments} — blanks block *and* line comments. Used by consumers
 *   that only ever want code (`symbolTable`, `references`, `semanticTokens`).
 * - {@link maskBlockComments} — blanks block comments only, leaving `//` runs
 *   intact. `parseUniforms` and `writeUniformHints` **read** the trailing line
 *   comment: that is where `@range` / `@label` / `@default` annotations live.
 *   Masking `//` for them would delete every uniform hint in the app.
 *
 * Both share one scanner, so `//` inside a block comment and `/*` inside a
 * line comment are classified identically by either entry point — only the
 * blanking of the line-comment run itself differs.
 *
 * ## Documented behaviour on malformed input
 *
 * An unterminated `/*` is the one place the two entry points disagree, and the
 * split is deliberate:
 *
 * - {@link maskComments} masks everything to end of input, mirroring how a
 *   GLSL compiler lexes it (the rest of the file *is* comment). Its consumers
 *   only feed editor affordances — symbols, highlighting, reference sites — so
 *   the worst case while the closing `*\/` is still untyped is that those
 *   affordances go quiet for a keystroke.
 * - {@link maskBlockComments} leaves it as plain text. Its consumers derive a
 *   node's **port surface** (`parseUniforms` → `nodeInputPorts`), and the store
 *   prunes every edge whose port disappeared. Masking to EOF there would turn
 *   the instant a user types `/*` into "all uniforms vanished", and the 50 ms
 *   editor debounce would delete the node's incoming edges for good — typing
 *   the closing `*\/` brings the ports back but not the wiring. A transient,
 *   syntactically incomplete edit must not destroy graph state.
 *
 * Both behaviours are pinned by unit test rather than left to chance.
 */

/** Replace every character except line terminators with a space. */
function blank(text: string): string {
  return text.replace(/[^\n\r]/g, " ");
}

/**
 * Single scanner behind both entry points. Walks the source once, classifying
 * `/*` and `//` starts in source order so neither can be recognised inside the
 * other. `maskLine` decides whether a line-comment run is blanked or kept;
 * `maskUnterminated` decides what an unopened-but-never-closed block does (see
 * the module docs — the port-deriving callers must not lose the rest of the
 * file mid-keystroke).
 */
function scan(
  source: string,
  maskLine: boolean,
  maskUnterminated: boolean,
): string {
  // Cheap bail-out: no comment can exist without a slash. Shader sources are
  // re-masked on every keystroke by the live-validation path.
  if (!source.includes("/")) return source;

  const n = source.length;
  let out = "";
  // Start of the not-yet-copied plain (non-comment) run.
  let plainStart = 0;
  let i = 0;

  while (i < n) {
    if (source.charCodeAt(i) !== 47 /* "/" */ || i + 1 >= n) {
      i += 1;
      continue;
    }
    const next = source.charCodeAt(i + 1);
    if (next === 42 /* "*" */) {
      const end = source.indexOf("*/", i + 2);
      if (end < 0 && !maskUnterminated) {
        // Treat the half-typed opener as ordinary text so the declarations
        // below it keep producing ports — see module docs.
        i += 2;
        continue;
      }
      // Unterminated block comment swallows the remainder — see module docs.
      const stop = end < 0 ? n : end + 2;
      out += source.slice(plainStart, i) + blank(source.slice(i, stop));
      i = stop;
      plainStart = stop;
      continue;
    }
    if (next === 47 /* "/" */) {
      const nl = source.indexOf("\n", i + 2);
      let stop = nl < 0 ? n : nl;
      // Keep a CRLF's `\r` out of the masked run so line lengths measured by
      // `split(/\r?\n/)` stay consistent with the unmasked source.
      if (stop > i && source.charCodeAt(stop - 1) === 13 /* "\r" */) stop -= 1;
      if (maskLine) {
        out += source.slice(plainStart, i) + blank(source.slice(i, stop));
        plainStart = stop;
      }
      i = stop;
      continue;
    }
    i += 1;
  }

  return out + source.slice(plainStart);
}

/**
 * Blank block comments (`/* … *\/`) only, preserving length and newlines.
 * Line comments survive untouched — callers that parse `//` annotations
 * (`parseUniforms`, `writeUniformHints`) depend on that.
 *
 * An unterminated `/*` is left as plain text: these callers derive port
 * surfaces, and a half-typed opener must not retire every uniform port (and
 * with it every incoming edge). See the module docs.
 */
export function maskBlockComments(source: string): string {
  return scan(source, false, false);
}

/**
 * Blank both block and line comments, preserving length and newlines. The
 * result is safe to run identifier scanners over: no match can land inside a
 * comment, and every match index still maps 1:1 onto the original source.
 *
 * An unterminated `/*` masks through end of input, as a GLSL lexer would.
 */
export function maskComments(source: string): string {
  return scan(source, true, true);
}

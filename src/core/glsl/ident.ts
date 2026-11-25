/**
 * The GLSL identifier shape, defined once for every editor/LSP helper.
 *
 * `IDENT_RE` and `IDENT_EXACT_RE` are non-global, so sharing one instance is
 * safe (`test` / `exec` / `String#search` keep no state between calls). Loops
 * that walk every identifier on a line need a `/g` regex, whose `lastIndex`
 * is shared mutable state — those callers take a private instance from
 * {@link identScanner} instead of a module-level `/g` constant.
 */

/** One GLSL identifier anywhere in a string (unanchored, non-global). */
export const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/;

/** A string that is exactly one GLSL identifier (anchored, non-global). */
export const IDENT_EXACT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A fresh global copy of {@link IDENT_RE} for `exec` loops. */
export function identScanner(): RegExp {
  return new RegExp(IDENT_RE.source, "g");
}

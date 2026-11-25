/**
 * Lexical and declaration helpers shared by the GLSL symbol table and its
 * reference consumers: bracket/declarator splitting for comma
 * multi-declarations, struct-body member-name offsets, the member-access
 * (`.`) guard, and function-parameter list parsing.
 *
 * Pure string functions — no symbol-table state. `parseSymbolTable`
 * (`symbolTable.ts`) drives the declarator helpers; `references.ts`,
 * `semanticTokens.ts` and the CodeMirror rename/go-to-definition extensions
 * use the struct-member and `.` guards directly.
 */

/** Net bracket depth of `s` — positive if it leaves ()/[]/{} open. */
export function bracketDepth(s: string): number {
  let d = 0;
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
  }
  return d;
}

/**
 * Split a declaration tail (`, b = mix(x, y), c;`) into declarator segments at
 * brace/paren depth-0 commas, stopping at the depth-0 semicolon. Commas nested
 * inside a function-call / array initializer are NOT separators, so
 * `vec3 c = mix(a, b, t);` yields no extra declarators (b/t are call args).
 */
export function splitTopLevelDeclarators(tail: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let seg = "";
  for (const ch of tail) {
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      seg += ch;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      seg += ch;
    } else if (depth === 0 && ch === ";") {
      out.push(seg);
      return out;
    } else if (depth === 0 && ch === ",") {
      out.push(seg);
      seg = "";
    } else {
      seg += ch;
    }
  }
  if (seg.trim()) out.push(seg);
  return out;
}

/**
 * Struct head, mirroring `RE_STRUCT` in `symbolTable.ts` but matched against a
 * whole masked
 * source with the `m` flag (`[ \t]*` rather than `\s*` so `^` really means
 * start-of-line). Drives {@link structBodyRanges}.
 */
const RE_STRUCT_HEAD = /^[ \t]*struct\s+[A-Za-z_][\w]*\s*\{/gm;

/**
 * Absolute offset ranges covering struct *bodies* — the span strictly between
 * a `struct Foo {` head's `{` and its matching `}` — in a comment-masked
 * source. Module-local: consumers want the narrower
 * {@link structMemberNameOffsets}.
 *
 * `masked` must already have comments blanked (see `stripComments.ts`) so a
 * brace inside a comment cannot move the walk.
 */
function structBodyRanges(masked: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  RE_STRUCT_HEAD.lastIndex = 0;
  let m = RE_STRUCT_HEAD.exec(masked);
  while (m !== null) {
    const open = masked.indexOf("{", m.index);
    if (open < 0) break;
    let depth = 0;
    // An unbalanced body runs to end-of-source, matching how `parseSymbolTable`
    // (`symbolTable.ts`) keeps `structDepth` raised until brace depth returns
    // to zero.
    let close = masked.length;
    for (let k = open; k < masked.length; k++) {
      const ch = masked[k];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          close = k;
          break;
        }
      }
    }
    ranges.push({ from: open + 1, to: close });
    // Nested heads inside this body are already covered by the range.
    RE_STRUCT_HEAD.lastIndex = close;
    m = RE_STRUCT_HEAD.exec(masked);
  }
  return ranges;
}

/** Qualifiers that may precede a struct member's type token. */
const MEMBER_TYPE_QUALIFIERS = new Set(["highp", "mediump", "lowp", "struct"]);

// Single-character classes of the `ident.ts` identifier shape, for the
// char-by-char member walk below (it never matches a whole word at once).
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/**
 * Absolute offsets of every struct **member declarator name** in a
 * comment-masked source — the `color` in `struct Light { vec3 color; };`.
 *
 * Struct members are not indexed by the symbol table (see `structDepth` in
 * `parseSymbolTable`, `symbolTable.ts`), so an identifier inside a struct body resolves to
 * whatever *global* happens to share its name. That is harmless for hover but
 * catastrophic for rename: renaming `uniform vec3 color` would also rewrite
 * the unrelated member declaration `vec3 color;` inside `struct Light`, while
 * every `light.color` access is skipped by the member-access guard — the
 * shader stops compiling. Reference consumers therefore drop matches that
 * start at one of these offsets.
 *
 * Only the *name* position is excluded, never the whole body. A member's type
 * token and any array-size expression are ordinary references to real globals:
 * `struct Outer { Inner i; };` genuinely uses the struct `Inner`, and
 * `float v[MAX];` genuinely uses the const `MAX`. Skipping those would recreate
 * the same broken-shader failure from the other side — the declaration renamed,
 * the use left behind.
 *
 * Known limitation: members of an *embedded* struct definition
 * (`struct Outer { struct Inner { float a; } i; };`) are not collected — only
 * the outer declarator `i` is. GLSL ES forbids embedded struct definitions, so
 * this shape cannot compile in the playground anyway.
 */
export function structMemberNameOffsets(masked: string): Set<number> {
  const out = new Set<number>();
  for (const body of structBodyRanges(masked)) {
    collectMemberNames(masked, body.from, body.to, out);
  }
  return out;
}

/**
 * Walk one struct body, recording the offset of each declarator name. State is
 * a three-way "what does the next depth-0 identifier mean" flag: the type comes
 * first, then one name per depth-0 comma-separated declarator, reset at each
 * depth-0 `;`. Identifiers nested in `[...]` / `(...)` / an embedded body are
 * never names.
 */
function collectMemberNames(
  masked: string,
  from: number,
  to: number,
  out: Set<number>,
): void {
  let depth = 0;
  let expectType = true;
  let expectName = false;
  let i = from;
  while (i < to) {
    // `charAt` rather than `masked[i]`: `i < to <= masked.length`, so it is
    // always a real character and needs no undefined check.
    const ch = masked.charAt(i);
    if (ch === "[" || ch === "(" || ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "]" || ch === ")" || ch === "}") {
      depth = Math.max(0, depth - 1);
      // Closing an embedded `struct … { … }`: the identifier that follows is
      // the member declarator for it.
      if (ch === "}" && depth === 0) {
        expectType = false;
        expectName = true;
      }
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ",") {
      expectName = true;
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ";") {
      expectType = true;
      expectName = false;
      i += 1;
      continue;
    }
    if (!isIdentStart(ch)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < to && isIdentPart(masked.charAt(j))) j += 1;
    if (depth === 0) {
      if (expectName) {
        out.add(i);
        expectName = false;
      } else if (
        expectType &&
        !MEMBER_TYPE_QUALIFIERS.has(masked.slice(i, j))
      ) {
        expectType = false;
        expectName = true;
      }
    }
    i = j;
  }
}

/**
 * True when the identifier starting at `index` is a member/swizzle access —
 * i.e. the nearest preceding non-blank character on the same line is `.`.
 *
 * `v.xyz`, `light.color` and `s.color.rgb` all bind to a *member*, never to
 * the global that happens to share the name, so reference/rename consumers
 * must not treat them as occurrences.
 *
 * Known limitation, deliberately left unhandled: a dot separated from its
 * member by a **line break** (`light\n  .color`) is not detected — the guard
 * only looks backwards within the current line. GLSL style in this playground
 * never wraps member access, and a cross-line walk would need the caller to
 * pass the whole document rather than one masked line.
 */
export function precededByDot(line: string, index: number): boolean {
  let k = index - 1;
  while (k >= 0) {
    const ch = line[k];
    if (ch !== " " && ch !== "\t") break;
    k -= 1;
  }
  return k >= 0 && line[k] === ".";
}

/**
 * Splits a function-parameter list (without surrounding parens) into
 * individual `{ qualifier?, type, name }` entries. Empty or `void` lists yield
 * an empty array. Default-value initializers are not supported by GLSL ES so
 * we don't attempt to parse them.
 */
export function parseFunctionParameters(
  list: string,
): Array<{ type: string; name: string }> {
  const trimmed = list.trim();
  if (!trimmed || trimmed === "void") return [];
  const out: Array<{ type: string; name: string }> = [];
  for (const raw of trimmed.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    // Strip leading qualifiers (`in` / `out` / `inout` / precision).
    const m =
      /^(?:(?:in|out|inout)\s+)?(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([A-Za-z_][\w]*)\s*(?:\[\d+\])?\s*$/.exec(
        part,
      );
    // Both capture groups are mandatory, so a match always fills them; the
    // undefined check only narrows the types for `noUncheckedIndexedAccess`.
    const type = m?.[1];
    const name = m?.[2];
    if (type === undefined || name === undefined) continue;
    out.push({ type, name });
  }
  return out;
}

/**
 * Returns a parameter list rendered back to its canonical `"type name, type
 * name"` form (no surrounding parens). Used as the `parameters` field on
 * function symbols for hover / autocomplete `detail`.
 */
export function formatParameters(
  params: Array<{ type: string; name: string }>,
): string {
  return params.map((p) => `${p.type} ${p.name}`).join(", ");
}

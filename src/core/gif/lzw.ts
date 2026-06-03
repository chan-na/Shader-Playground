/**
 * GIF89a variable-width LZW compression (Phase 31).
 *
 * Pure data-in / data-out — no DOM, no GL. Encodes a stream of palette
 * indices (each `< 2^minCodeSize`) into the LZW byte stream that follows the
 * "LZW minimum code size" byte inside a GIF image-data block. The caller is
 * responsible for framing the result into ≤255-byte sub-blocks (see encode.ts).
 *
 * The algorithm is the canonical GIF variant:
 *   - codes start at `minCodeSize + 1` bits, packed LSB-first,
 *   - a Clear code (`1 << minCodeSize`) precedes the data and resets the table,
 *   - an End-Of-Information code (`Clear + 1`) terminates it,
 *   - the code width grows by one bit each time the next free code reaches the
 *     current `2^width` boundary, and the table is cleared once it fills at
 *     4096 entries.
 *
 * Code-width bump timing is kept symmetric with the decoder: the encoder's
 * `next` (index it will assign to the next new string) mirrors the decoder's
 * `available` count, so both widen at the same code.
 */

const MAX_CODE = 4096;
const MAX_WIDTH = 12;

export function lzwEncode(
  indices: Uint8Array,
  minCodeSize: number,
): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeWidth;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  // `dict` maps (prefixCode << 8 | nextIndex) → assigned code.
  let dict = new Map<number, number>();
  let next = eoiCode + 1;
  let codeWidth = minCodeSize + 1;
  const reset = (): void => {
    dict = new Map();
    next = eoiCode + 1;
    codeWidth = minCodeSize + 1;
  };

  emit(clearCode);

  if (indices.length === 0) {
    emit(eoiCode);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return new Uint8Array(out);
  }

  let current = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] ?? 0;
    const key = (current << 8) | k;
    const existing = dict.get(key);
    if (existing !== undefined) {
      current = existing;
      continue;
    }
    emit(current);
    if (next < MAX_CODE) {
      dict.set(key, next);
      next++;
      // The decoder builds its table one code behind the encoder, so it widens
      // one code later. Bump at 2^width + 1 (not 2^width) to stay in lockstep.
      if (next === (1 << codeWidth) + 1 && codeWidth < MAX_WIDTH) codeWidth++;
    }
    if (next === MAX_CODE) {
      // Table full — flush a Clear so the decoder rebuilds from scratch.
      emit(clearCode);
      reset();
    }
    current = k;
  }

  emit(current);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return new Uint8Array(out);
}

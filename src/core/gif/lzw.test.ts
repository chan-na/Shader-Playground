import { describe, expect, it } from "vitest";
import { lzwEncode } from "./lzw";

/**
 * Reference GIF LZW decoder following the GIF89a spec (Appendix F) — the same
 * algorithm browsers use. A successful round-trip against this independent
 * decoder proves the encoder's code-width bump timing and table handling are
 * spec-correct, not merely self-consistent.
 */
function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeWidth = minCodeSize + 1;
  let table: number[][] = [];
  let nextCode = eoiCode + 1;
  const reset = (): void => {
    table = [];
    for (let i = 0; i < clearCode; i++) table.push([i]);
    table.push([]); // clear
    table.push([]); // eoi
    nextCode = eoiCode + 1;
    codeWidth = minCodeSize + 1;
  };

  let bitPos = 0;
  const totalBits = data.length * 8;
  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeWidth; i++) {
      const byte = data[bitPos >> 3] ?? 0;
      code |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return code;
  };

  reset();
  const out: number[] = [];
  let old = -1;
  while (bitPos + codeWidth <= totalBits) {
    const code = readCode();
    if (code === clearCode) {
      reset();
      old = -1;
      continue;
    }
    if (code === eoiCode) break;

    if (old === -1) {
      const entry = table[code] ?? [];
      out.push(...entry);
      old = code;
      continue;
    }

    const prev = table[old] ?? [];
    let entry: number[];
    if (code < table.length) {
      entry = table[code] ?? [];
    } else {
      entry = [...prev, prev[0] ?? 0];
    }
    out.push(...entry);
    table.push([...prev, entry[0] ?? 0]);
    nextCode++;
    if (nextCode === 1 << codeWidth && codeWidth < 12) codeWidth++;
    old = code;
  }
  return out;
}

function roundtrip(indices: number[], minCodeSize: number): number[] {
  return lzwDecode(
    lzwEncode(Uint8Array.from(indices), minCodeSize),
    minCodeSize,
  );
}

describe("lzwEncode", () => {
  it("emits a clear code then EOI for empty input", () => {
    const bytes = lzwEncode(new Uint8Array(0), 2);
    // First code (3 bits) is the clear code (4); decoding yields nothing.
    expect(bytes.length).toBeGreaterThan(0);
    expect(roundtrip([], 2)).toEqual([]);
  });

  it("round-trips a single index", () => {
    expect(roundtrip([5], 4)).toEqual([5]);
  });

  it("round-trips a short repeated run", () => {
    const input = [1, 1, 1, 2, 2, 3, 1, 1, 2, 2, 2, 2];
    expect(roundtrip(input, 2)).toEqual(input);
  });

  it("round-trips data that forces code-width growth", () => {
    // 16-color palette, long pseudo-random stream → dictionary grows past
    // several power-of-two boundaries, exercising width bumps.
    const input: number[] = [];
    let seed = 123456789;
    for (let i = 0; i < 5000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      input.push(seed % 16);
    }
    expect(roundtrip(input, 4)).toEqual(input);
  });

  it("round-trips a stream long enough to fill and reset the table", () => {
    // 256-color, 60k pseudo-random indices → next code reaches 4096 and the
    // encoder flushes a clear code mid-stream.
    const input: number[] = [];
    let seed = 987654321;
    for (let i = 0; i < 60000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      input.push(seed % 256);
    }
    expect(roundtrip(input, 8)).toEqual(input);
  });

  it("round-trips the KwKwK self-referential pattern", () => {
    // The classic case where the encoder emits a code equal to the entry it is
    // about to add. minCodeSize 2 keeps the table small so it triggers early.
    const input = [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(roundtrip(input, 2)).toEqual(input);
  });
});

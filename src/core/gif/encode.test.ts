import { describe, expect, it } from "vitest";
import { encodeGif, type GifFrame } from "./encode";

// --- Minimal GIF89a parser for verification -------------------------------

interface ParsedImage {
  delayCs: number;
  indices: number[];
}
interface ParsedGif {
  version: string;
  width: number;
  height: number;
  hasLoop: boolean;
  palette: number[][];
  images: ParsedImage[];
}

function lzwDecode(
  data: number[],
  minCodeSize: number,
  pixelCount: number,
): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeWidth = minCodeSize + 1;
  let table: number[][] = [];
  let nextCode = eoiCode + 1;
  const reset = (): void => {
    table = [];
    for (let i = 0; i < clearCode; i++) table.push([i]);
    table.push([], []);
    nextCode = eoiCode + 1;
    codeWidth = minCodeSize + 1;
  };
  let bitPos = 0;
  const total = data.length * 8;
  const read = (): number => {
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
  while (bitPos + codeWidth <= total && out.length < pixelCount) {
    const code = read();
    if (code === clearCode) {
      reset();
      old = -1;
      continue;
    }
    if (code === eoiCode) break;
    if (old === -1) {
      out.push(...(table[code] ?? []));
      old = code;
      continue;
    }
    const prev = table[old] ?? [];
    const entry =
      code < table.length ? (table[code] ?? []) : [...prev, prev[0] ?? 0];
    out.push(...entry);
    table.push([...prev, entry[0] ?? 0]);
    nextCode++;
    if (nextCode === 1 << codeWidth && codeWidth < 12) codeWidth++;
    old = code;
  }
  return out;
}

function parseGif(bytes: Uint8Array): ParsedGif {
  let p = 0;
  const u8 = (): number => bytes[p++] ?? 0;
  const u16 = (): number => {
    const v = (bytes[p] ?? 0) | ((bytes[p + 1] ?? 0) << 8);
    p += 2;
    return v;
  };
  const version = String.fromCharCode(...bytes.slice(0, 6));
  p = 6;
  const width = u16();
  const height = u16();
  const packed = u8();
  u8(); // bg index
  u8(); // aspect ratio
  const gctSize = 2 << (packed & 0x07);
  const palette: number[][] = [];
  for (let i = 0; i < gctSize; i++) palette.push([u8(), u8(), u8()]);

  const readSubBlocks = (): number[] => {
    const data: number[] = [];
    let len = u8();
    while (len !== 0) {
      for (let i = 0; i < len; i++) data.push(u8());
      len = u8();
    }
    return data;
  };

  let hasLoop = false;
  const images: ParsedImage[] = [];
  let pendingDelay = 0;
  while (p < bytes.length) {
    const sep = u8();
    if (sep === 0x3b) break; // trailer
    if (sep === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8(); // block size (4)
        u8(); // packed
        pendingDelay = u16();
        u8(); // transparent index
        u8(); // terminator
      } else if (label === 0xff) {
        const size = u8();
        const ident = String.fromCharCode(...bytes.slice(p, p + size));
        p += size;
        if (ident === "NETSCAPE2.0") hasLoop = true;
        readSubBlocks();
      } else {
        readSubBlocks();
      }
    } else if (sep === 0x2c) {
      u16(); // left
      u16(); // top
      const w = u16();
      const h = u16();
      u8(); // packed (no local table)
      const minCodeSize = u8();
      const lzw = readSubBlocks();
      images.push({
        delayCs: pendingDelay,
        indices: lzwDecode(lzw, minCodeSize, w * h),
      });
      pendingDelay = 0;
    } else {
      break;
    }
  }
  return { version, width, height, hasLoop, palette, images };
}

// --- Tests ----------------------------------------------------------------

function solid(
  w: number,
  h: number,
  color: [number, number, number],
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe("encodeGif", () => {
  it("rejects empty input and non-positive dimensions", () => {
    expect(() => encodeGif({ width: 2, height: 2, frames: [] })).toThrow();
    expect(() =>
      encodeGif({
        width: 0,
        height: 2,
        frames: [{ rgba: new Uint8Array(0), delayMs: 100 }],
      }),
    ).toThrow();
  });

  it("emits a valid GIF89a header and screen size", () => {
    const bytes = encodeGif({
      width: 3,
      height: 2,
      frames: [{ rgba: solid(3, 2, [255, 0, 0]), delayMs: 100 }],
    });
    const gif = parseGif(bytes);
    expect(gif.version).toBe("GIF89a");
    expect(gif.width).toBe(3);
    expect(gif.height).toBe(2);
    expect(bytes[bytes.length - 1]).toBe(0x3b); // trailer
  });

  it("writes the NETSCAPE loop extension only when loop is set", () => {
    const f: GifFrame = { rgba: solid(2, 2, [0, 0, 0]), delayMs: 100 };
    expect(
      parseGif(encodeGif({ width: 2, height: 2, frames: [f] })).hasLoop,
    ).toBe(true);
    expect(
      parseGif(encodeGif({ width: 2, height: 2, frames: [f], loop: false }))
        .hasLoop,
    ).toBe(false);
  });

  it("reconstructs pixel indices for a two-color checkerboard", () => {
    // 2x2 with two 5-bit-aligned colors so the palette stores them exactly.
    const black: [number, number, number] = [0, 0, 0];
    const white: [number, number, number] = [255, 255, 255];
    const rgba = new Uint8Array(2 * 2 * 4);
    const px = [black, white, white, black];
    for (let i = 0; i < 4; i++) {
      const c = px[i] ?? black;
      rgba[i * 4] = c[0];
      rgba[i * 4 + 1] = c[1];
      rgba[i * 4 + 2] = c[2];
      rgba[i * 4 + 3] = 255;
    }
    const gif = parseGif(
      encodeGif({ width: 2, height: 2, frames: [{ rgba, delayMs: 80 }] }),
    );
    expect(gif.images).toHaveLength(1);
    const img = gif.images[0];
    if (!img) throw new Error("no image");
    // Map decoded indices back to colors and compare to the source pixels.
    const decoded = img.indices.map((i) => gif.palette[i] ?? [0, 0, 0]);
    expect(decoded).toEqual([
      [0, 0, 0],
      [255, 255, 255],
      [255, 255, 255],
      [0, 0, 0],
    ]);
  });

  it("encodes multiple frames with per-frame delays (centiseconds)", () => {
    const frames: GifFrame[] = [
      { rgba: solid(2, 2, [255, 0, 0]), delayMs: 100 },
      { rgba: solid(2, 2, [0, 255, 0]), delayMs: 200 },
      { rgba: solid(2, 2, [0, 0, 255]), delayMs: 50 },
    ];
    const gif = parseGif(encodeGif({ width: 2, height: 2, frames }));
    expect(gif.images).toHaveLength(3);
    expect(gif.images.map((i) => i.delayCs)).toEqual([10, 20, 5]);
  });

  it("clamps tiny delays up to the 2cs minimum", () => {
    const gif = parseGif(
      encodeGif({
        width: 2,
        height: 2,
        frames: [{ rgba: solid(2, 2, [1, 2, 3]), delayMs: 5 }],
      }),
    );
    expect(gif.images[0]?.delayCs).toBe(2);
  });
});

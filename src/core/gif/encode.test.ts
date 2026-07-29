import { describe, expect, it } from "vitest";
import { encodeGif, type GifFrame } from "./encode";
import { mapToPaletteDithered } from "./quantize";

// --- Minimal GIF89a parser for verification -------------------------------

interface ParsedImage {
  delayCs: number;
  indices: number[];
  /** Local color table, when the image carries one. */
  palette?: number[][];
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
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 2 << (packed & 0x07) : 0;
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
      const ipacked = u8();
      let localPalette: number[][] | undefined;
      if (ipacked & 0x80) {
        const lctSize = 2 << (ipacked & 0x07);
        localPalette = [];
        for (let i = 0; i < lctSize; i++) localPalette.push([u8(), u8(), u8()]);
      }
      const minCodeSize = u8();
      const lzw = readSubBlocks();
      images.push({
        delayCs: pendingDelay,
        indices: lzwDecode(lzw, minCodeSize, w * h),
        ...(localPalette ? { palette: localPalette } : {}),
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

  // #31 — the GCE delay field is u16. A caller handing over an absurd delay
  // (a stalled RAF loop, a hand-built frame list) must saturate rather than
  // wrap: 0x10000 cs would truncate to 0 and play "as fast as possible".
  it("saturates an out-of-range delay at the u16 maximum instead of wrapping", () => {
    const gif = parseGif(
      encodeGif({
        width: 2,
        height: 2,
        frames: [{ rgba: solid(2, 2, [1, 2, 3]), delayMs: 60 * 60 * 1000 }],
      }),
    );
    expect(gif.images[0]?.delayCs).toBe(0xffff);
  });

  it("omits the global table and emits per-frame local tables when localPalette is set", () => {
    const frames: GifFrame[] = [
      { rgba: solid(2, 2, [255, 0, 0]), delayMs: 100 },
      { rgba: solid(2, 2, [0, 255, 0]), delayMs: 100 },
    ];
    const gif = parseGif(
      encodeGif({ width: 2, height: 2, frames, localPalette: true }),
    );
    // No global color table — each image carries its own.
    expect(gif.palette).toHaveLength(0);
    expect(gif.images).toHaveLength(2);
    for (const img of gif.images) expect(img.palette).toBeDefined();

    // Reconstruct each frame's pixels from its own local palette.
    const decode = (img: ParsedImage): number[][] =>
      img.indices.map((i) => img.palette?.[i] ?? [0, 0, 0]);
    const img0 = gif.images[0];
    const img1 = gif.images[1];
    if (!img0 || !img1) throw new Error("missing image");
    expect(
      decode(img0).every((c) => c[0] === 255 && c[1] === 0 && c[2] === 0),
    ).toBe(true);
    expect(
      decode(img1).every((c) => c[0] === 0 && c[1] === 255 && c[2] === 0),
    ).toBe(true);
  });

  it("stays decodable with dithering enabled", () => {
    // A 4×1 gradient against a 4-color palette forces real dithering choices;
    // the stream must still decode to one valid palette index per pixel.
    const w = 4;
    const rgba = new Uint8Array(w * 4);
    for (let x = 0; x < w; x++) {
      const v = x * 80;
      rgba[x * 4] = v;
      rgba[x * 4 + 1] = v;
      rgba[x * 4 + 2] = v;
      rgba[x * 4 + 3] = 255;
    }
    const gif = parseGif(
      encodeGif(
        {
          width: w,
          height: 1,
          frames: [{ rgba, delayMs: 100 }],
          maxColors: 4,
        },
        mapToPaletteDithered,
      ),
    );
    const img = gif.images[0];
    if (!img) throw new Error("no image");
    expect(img.indices).toHaveLength(w);
    for (const i of img.indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(gif.palette.length);
    }
  });

  it("reports onProgress once per frame with a monotonic, complete count", () => {
    const frames: GifFrame[] = [
      { rgba: solid(2, 2, [255, 0, 0]), delayMs: 100 },
      { rgba: solid(2, 2, [0, 255, 0]), delayMs: 100 },
      { rgba: solid(2, 2, [0, 0, 255]), delayMs: 100 },
    ];
    const calls: Array<[number, number]> = [];
    encodeGif({ width: 2, height: 2, frames }, undefined, (done, total) =>
      calls.push([done, total]),
    );
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("does not require onProgress (optional)", () => {
    const bytes = encodeGif({
      width: 2,
      height: 2,
      frames: [{ rgba: solid(2, 2, [1, 2, 3]), delayMs: 100 }],
    });
    expect(parseGif(bytes).images).toHaveLength(1);
  });

  it("survives buffer growth + multi-sub-block payloads (large high-entropy frames)", () => {
    // buildPalette histograms colors at 5-bit-per-channel (rgb555) precision,
    // so only grid-aligned channels survive quantization exactly. Using 16
    // distinct grid-aligned colors (≤256 → the lossless one-box-per-color
    // branch) keeps the round-trip exact, so a byte the writer corrupts surfaces
    // as a pixel mismatch rather than quantizer noise.
    const grid = (k: number): number => ((k << 3) | (k >> 2)) & 0xff;
    const COLORS = 16;
    const paletteColors: Array<[number, number, number]> = [];
    for (let i = 0; i < COLORS; i++) {
      paletteColors.push([
        grid(i * 2),
        grid((i * 3 + 5) & 31),
        grid((31 - i * 2) & 31),
      ]);
    }
    // Deterministic per-pixel hash → no long runs, so LZW can't compress. Each
    // frame's payload lands well past 255 bytes (many sub-blocks via
    // writeSubBlocks/raw) and the whole stream outgrows ByteWriter's initial
    // capacity (several doublings). A solid/gradient frame would compress to a
    // handful of bytes and exercise neither path.
    const W = 80;
    const H = 80;
    const patterned = (seed: number): Uint8Array => {
      const out = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let h =
            (Math.imul(x, 374761393) +
              Math.imul(y, 668265263) +
              Math.imul(seed, 2246822519)) >>>
            0;
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
          const c = paletteColors[h % COLORS]!;
          const o = (y * W + x) * 4;
          out[o] = c[0];
          out[o + 1] = c[1];
          out[o + 2] = c[2];
          out[o + 3] = 255;
        }
      }
      return out;
    };
    const sources = [patterned(1), patterned(2), patterned(3)];
    const frames: GifFrame[] = sources.map((rgba) => ({ rgba, delayMs: 60 }));

    const bytes = encodeGif({ width: W, height: H, frames });
    // Clearly outgrew the writer's initial capacity → the doubling-grow path
    // ran without corrupting earlier bytes.
    expect(bytes.length).toBeGreaterThan(4096);

    const gif = parseGif(bytes);
    expect(gif.images).toHaveLength(3);
    for (let f = 0; f < sources.length; f++) {
      const img = gif.images[f]!;
      const src = sources[f]!;
      expect(img.indices).toHaveLength(W * H);
      let allMatch = true;
      for (let px = 0; px < W * H && allMatch; px++) {
        const color = gif.palette[img.indices[px]!] ?? [-1, -1, -1];
        if (
          color[0] !== src[px * 4] ||
          color[1] !== src[px * 4 + 1] ||
          color[2] !== src[px * 4 + 2]
        ) {
          allMatch = false;
        }
      }
      expect(allMatch).toBe(true);
    }

    // Re-encoding the same frames is byte-identical — guards against state
    // leaking across the writer's reallocations.
    expect(encodeGif({ width: W, height: H, frames })).toEqual(bytes);
  });
});

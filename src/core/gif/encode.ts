/**
 * GIF89a assembler (Phase 31).
 *
 * Combines the quantizer (quantize.ts) and LZW compressor (lzw.ts) into a
 * complete animated GIF byte stream. Pure data-in / data-out — no DOM, no GL.
 *
 * Layout: header → logical screen descriptor → (optional) global color table →
 * (optional) NETSCAPE2.0 looping extension → per-frame [graphic control
 * extension → image descriptor → (optional) local color table → LZW image
 * data] → trailer.
 *
 * By default a single global palette is shared by every frame (no local color
 * tables), which keeps both the encoder and the output compact. With
 * `localPalette` (Phase 33) each frame instead carries its own ≤256-color local
 * table — better fidelity for clips whose colors drift over time — and the
 * global table is omitted.
 *
 * The per-pixel palette mapping is injected as `mapper` (Phase 33): callers
 * pass `mapToPaletteDithered` for Floyd–Steinberg dithering, or omit it for the
 * plain nearest-color default. Keeping the dithering pass out of this module's
 * static import graph lets it stay in the encode worker chunk only — the rare
 * main-thread inline fallback ships the lighter default and never pulls the
 * dithering code into the initial bundle.
 */

import { lzwEncode } from "./lzw";
import { buildPalette, mapToPalette } from "./quantize";

export interface GifFrame {
  /** Tightly packed RGBA, `width * height * 4` bytes. */
  rgba: Uint8Array;
  /** Display duration of this frame in milliseconds. */
  delayMs: number;
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  frames: ReadonlyArray<GifFrame>;
  /** Palette ceiling (2..256). Defaults to 256. */
  maxColors?: number;
  /** Loop forever via the NETSCAPE2.0 extension. Defaults to true. */
  loop?: boolean;
  /** Per-frame local color table instead of one shared global table. Default false. */
  localPalette?: boolean;
}

/**
 * Maps an RGBA frame to palette indices. `mapToPalette` (default) does plain
 * nearest-color; `mapToPaletteDithered` adds Floyd–Steinberg error diffusion.
 */
export type FrameMapper = (
  rgba: Uint8Array,
  palette: Uint8Array,
  width: number,
  height: number,
) => Uint8Array;

const defaultMapper: FrameMapper = (rgba, palette) =>
  mapToPalette(rgba, palette);

function pushU16LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff);
}

/** GIF color-table size field: bits such that 2^bits ≥ colorCount, min 2. */
function paletteBits(colorCount: number): number {
  return Math.max(2, Math.ceil(Math.log2(Math.max(2, colorCount))));
}

/** Emit a color table padded to 2^bits entries (3 bytes each). */
function pushColorTable(
  out: number[],
  palette: Uint8Array,
  bits: number,
): void {
  const entries = 1 << bits;
  for (let i = 0; i < entries; i++) {
    out.push(
      palette[i * 3] ?? 0,
      palette[i * 3 + 1] ?? 0,
      palette[i * 3 + 2] ?? 0,
    );
  }
}

/** Emit LZW data as a series of ≤255-byte GIF sub-blocks, terminated by 0x00. */
function pushSubBlocks(out: number[], data: Uint8Array): void {
  let offset = 0;
  while (offset < data.length) {
    const len = Math.min(255, data.length - offset);
    out.push(len);
    for (let i = 0; i < len; i++) out.push(data[offset + i] ?? 0);
    offset += len;
  }
  out.push(0x00);
}

export function encodeGif(
  opts: EncodeGifOptions,
  mapper: FrameMapper = defaultMapper,
): Uint8Array {
  const { width, height, frames } = opts;
  if (width <= 0 || height <= 0) {
    throw new Error("encodeGif: width and height must be positive");
  }
  if (frames.length === 0) {
    throw new Error("encodeGif: at least one frame is required");
  }
  const loop = opts.loop ?? true;
  const maxColors = Math.max(2, Math.min(256, opts.maxColors ?? 256));
  const localPalette = opts.localPalette ?? false;

  // Global palette is only built (and emitted) when frames share one table.
  const globalPalette = localPalette
    ? null
    : buildPalette(
        frames.map((f) => f.rgba),
        maxColors,
      );
  const globalBits = globalPalette
    ? paletteBits(Math.floor(globalPalette.length / 3))
    : 0;

  const out: number[] = [];

  // Header.
  for (const ch of "GIF89a") out.push(ch.charCodeAt(0));

  // Logical Screen Descriptor.
  pushU16LE(out, width);
  pushU16LE(out, height);
  if (globalPalette) {
    // Global color table present, color resolution bits-1, no sort, size bits-1.
    out.push(0x80 | ((globalBits - 1) << 4) | (globalBits - 1));
  } else {
    // No global color table — each frame carries its own local table.
    out.push(0x00);
  }
  out.push(0); // background color index
  out.push(0); // pixel aspect ratio

  if (globalPalette) {
    pushColorTable(out, globalPalette, globalBits);
  }

  // NETSCAPE2.0 looping extension (loop count 0 = forever).
  if (loop) {
    out.push(0x21, 0xff, 0x0b);
    for (const ch of "NETSCAPE2.0") out.push(ch.charCodeAt(0));
    out.push(0x03, 0x01);
    pushU16LE(out, 0);
    out.push(0x00);
  }

  for (const frame of frames) {
    // Graphic Control Extension — disposal method 1 (leave in place), no
    // transparency. Delay is in centiseconds; clamp so browsers don't treat
    // very small values as "as fast as possible".
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10));
    out.push(0x21, 0xf9, 0x04, 0x04);
    pushU16LE(out, delayCs);
    out.push(0x00, 0x00);

    // Per-frame palette (local) or the shared global one.
    const framePalette = globalPalette ?? buildPalette([frame.rgba], maxColors);
    const frameBits = globalPalette
      ? globalBits
      : paletteBits(Math.floor(framePalette.length / 3));

    // Image Descriptor — full frame; local color table flag set when per-frame.
    out.push(0x2c);
    pushU16LE(out, 0);
    pushU16LE(out, 0);
    pushU16LE(out, width);
    pushU16LE(out, height);
    out.push(globalPalette ? 0x00 : 0x80 | (frameBits - 1));

    if (!globalPalette) {
      pushColorTable(out, framePalette, frameBits);
    }

    const indices = mapper(frame.rgba, framePalette, width, height);
    out.push(frameBits); // LZW minimum code size
    pushSubBlocks(out, lzwEncode(indices, frameBits));
  }

  out.push(0x3b); // trailer
  return new Uint8Array(out);
}

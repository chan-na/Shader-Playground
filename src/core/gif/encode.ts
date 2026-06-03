/**
 * GIF89a assembler (Phase 31).
 *
 * Combines the quantizer (quantize.ts) and LZW compressor (lzw.ts) into a
 * complete animated GIF byte stream. Pure data-in / data-out — no DOM, no GL.
 *
 * Layout: header → logical screen descriptor → global color table →
 * (optional) NETSCAPE2.0 looping extension → per-frame [graphic control
 * extension → image descriptor → LZW image data] → trailer.
 *
 * A single global palette is shared by every frame (no local color tables),
 * which keeps both the encoder and the output compact.
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
}

function pushU16LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff);
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

export function encodeGif(opts: EncodeGifOptions): Uint8Array {
  const { width, height, frames } = opts;
  if (width <= 0 || height <= 0) {
    throw new Error("encodeGif: width and height must be positive");
  }
  if (frames.length === 0) {
    throw new Error("encodeGif: at least one frame is required");
  }
  const loop = opts.loop ?? true;
  const maxColors = Math.max(2, Math.min(256, opts.maxColors ?? 256));

  const palette = buildPalette(
    frames.map((f) => f.rgba),
    maxColors,
  );
  const colorCount = Math.floor(palette.length / 3);

  // Bit depth that covers the palette; also the LZW minimum code size and the
  // global-color-table size field (entries = 2^bits).
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, colorCount))));
  const tableEntries = 1 << bits;
  const minCodeSize = bits;

  const out: number[] = [];

  // Header.
  for (const ch of "GIF89a") out.push(ch.charCodeAt(0));

  // Logical Screen Descriptor: global color table present, color resolution
  // bits-1, no sort, table size field bits-1.
  pushU16LE(out, width);
  pushU16LE(out, height);
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1));
  out.push(0); // background color index
  out.push(0); // pixel aspect ratio

  // Global Color Table, padded to 2^bits entries.
  for (let i = 0; i < tableEntries; i++) {
    out.push(
      palette[i * 3] ?? 0,
      palette[i * 3 + 1] ?? 0,
      palette[i * 3 + 2] ?? 0,
    );
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

    // Image Descriptor — full frame, no local color table.
    out.push(0x2c);
    pushU16LE(out, 0);
    pushU16LE(out, 0);
    pushU16LE(out, width);
    pushU16LE(out, height);
    out.push(0x00);

    const indices = mapToPalette(frame.rgba, palette);
    out.push(minCodeSize);
    pushSubBlocks(out, lzwEncode(indices, minCodeSize));
  }

  out.push(0x3b); // trailer
  return new Uint8Array(out);
}

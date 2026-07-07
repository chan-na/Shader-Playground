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
 *
 * An optional `onProgress(done, total)` callback (Phase 34) fires once per
 * assembled frame so the worker can report encode progress back to the UI.
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

/** Reports encode progress after each frame: `done` of `total` frames written. */
export type EncodeProgress = (done: number, total: number) => void;

const defaultMapper: FrameMapper = (rgba, palette) =>
  mapToPalette(rgba, palette);

/**
 * Growable byte sink for the GIF assembler (L26). Replaces the former
 * `number[]` accumulator — which boxed one heap number per byte and then copied
 * the whole list into a Uint8Array at the end — with a doubling Uint8Array
 * buffer. Bytes land directly in typed storage (no boxing), and large runs
 * (LZW sub-block payloads) copy in one `set()` instead of per byte. `finish()`
 * returns an exact-size Uint8Array (fresh buffer) so the encode worker can
 * still transfer `bytes.buffer` cleanly.
 */
class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity: number) {
    this.buf = new Uint8Array(Math.max(64, initialCapacity));
  }

  private ensure(extra: number): void {
    const need = this.len + extra;
    if (need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v;
  }

  /** Write a small fixed run of constant bytes (headers, block markers). */
  bytes(...vals: number[]): void {
    this.ensure(vals.length);
    for (const v of vals) this.buf[this.len++] = v;
  }

  /** Little-endian uint16 — GIF's canonical multi-byte integer encoding. */
  u16le(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >> 8) & 0xff;
  }

  /** Write each char's low byte (GIF ASCII fields are single-byte). */
  ascii(s: string): void {
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) this.buf[this.len++] = s.charCodeAt(i);
  }

  /** Bulk-copy a byte range in one `set()` — used for LZW sub-block payloads. */
  raw(data: Uint8Array): void {
    this.ensure(data.length);
    this.buf.set(data, this.len);
    this.len += data.length;
  }

  /** Exact-size copy of everything written (fresh buffer, safe to transfer). */
  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** GIF color-table size field: bits such that 2^bits ≥ colorCount, min 2. */
function paletteBits(colorCount: number): number {
  return Math.max(2, Math.ceil(Math.log2(Math.max(2, colorCount))));
}

/** Emit a color table padded to 2^bits entries (3 bytes each). */
function writeColorTable(
  w: ByteWriter,
  palette: Uint8Array,
  bits: number,
): void {
  const entries = 1 << bits;
  for (let i = 0; i < entries; i++) {
    w.byte(palette[i * 3] ?? 0);
    w.byte(palette[i * 3 + 1] ?? 0);
    w.byte(palette[i * 3 + 2] ?? 0);
  }
}

/** Emit LZW data as a series of ≤255-byte GIF sub-blocks, terminated by 0x00. */
function writeSubBlocks(w: ByteWriter, data: Uint8Array): void {
  let offset = 0;
  while (offset < data.length) {
    const len = Math.min(255, data.length - offset);
    w.byte(len);
    w.raw(data.subarray(offset, offset + len));
    offset += len;
  }
  w.byte(0x00);
}

export function encodeGif(
  opts: EncodeGifOptions,
  mapper: FrameMapper = defaultMapper,
  onProgress?: EncodeProgress,
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

  // Pre-size for the fixed structural bytes (header, screen descriptor, global
  // table, per-frame GCE/image-descriptor); the LZW payload grows the buffer by
  // doubling as it lands.
  const w = new ByteWriter(
    1024 + (globalPalette ? (1 << globalBits) * 3 : 0) + frames.length * 96,
  );

  // Header.
  w.ascii("GIF89a");

  // Logical Screen Descriptor.
  w.u16le(width);
  w.u16le(height);
  if (globalPalette) {
    // Global color table present, color resolution bits-1, no sort, size bits-1.
    w.byte(0x80 | ((globalBits - 1) << 4) | (globalBits - 1));
  } else {
    // No global color table — each frame carries its own local table.
    w.byte(0x00);
  }
  w.byte(0); // background color index
  w.byte(0); // pixel aspect ratio

  if (globalPalette) {
    writeColorTable(w, globalPalette, globalBits);
  }

  // NETSCAPE2.0 looping extension (loop count 0 = forever).
  if (loop) {
    w.bytes(0x21, 0xff, 0x0b);
    w.ascii("NETSCAPE2.0");
    w.bytes(0x03, 0x01);
    w.u16le(0);
    w.byte(0x00);
  }

  let done = 0;
  for (const frame of frames) {
    // Graphic Control Extension — disposal method 1 (leave in place), no
    // transparency. Delay is in centiseconds; clamp so browsers don't treat
    // very small values as "as fast as possible".
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10));
    w.bytes(0x21, 0xf9, 0x04, 0x04);
    w.u16le(delayCs);
    w.bytes(0x00, 0x00);

    // Per-frame palette (local) or the shared global one.
    const framePalette = globalPalette ?? buildPalette([frame.rgba], maxColors);
    const frameBits = globalPalette
      ? globalBits
      : paletteBits(Math.floor(framePalette.length / 3));

    // Image Descriptor — full frame; local color table flag set when per-frame.
    w.byte(0x2c);
    w.u16le(0);
    w.u16le(0);
    w.u16le(width);
    w.u16le(height);
    w.byte(globalPalette ? 0x00 : 0x80 | (frameBits - 1));

    if (!globalPalette) {
      writeColorTable(w, framePalette, frameBits);
    }

    const indices = mapper(frame.rgba, framePalette, width, height);
    w.byte(frameBits); // LZW minimum code size
    writeSubBlocks(w, lzwEncode(indices, frameBits));

    onProgress?.(++done, frames.length);
  }

  w.byte(0x3b); // trailer
  return w.finish();
}

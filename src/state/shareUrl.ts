import type { Graph } from "../core/graph/types";
import {
  deserializeProject,
  type SerializedProject,
  serializeProject,
} from "./serialization";
import type { NodePosition } from "./types";

/**
 * URL-safe base64 round-trip helpers (no padding, replacing +/ with -_).
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "==".slice(0, (4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  // CompressionStream is supported in all evergreen browsers (Chrome 80+,
  // Firefox 113+, Safari 16.4+). Fall back to passthrough if missing.
  if (typeof CompressionStream === "undefined") return bytes;
  const cs = new CompressionStream("gzip");
  const stream = new Response(bytes).body?.pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return bytes;
  const ds = new DecompressionStream("gzip");
  const stream = new Response(bytes).body?.pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Encode a project into a URL-safe base64-encoded gzip payload. Designed
 * to live in `location.hash` (#share=<payload>).
 */
export async function encodeShareUrl(
  graph: Graph,
  positions: Record<string, NodePosition>,
  origin?: string,
): Promise<string> {
  const project = serializeProject(graph, positions);
  const json = JSON.stringify(project);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzip(bytes);
  const payload = bytesToBase64Url(compressed);
  const base =
    origin ??
    (typeof location !== "undefined"
      ? `${location.origin}${location.pathname}`
      : "");
  return `${base}#share=${payload}`;
}

/**
 * Parse a `#share=<payload>` fragment back into a graph + positions.
 * Returns null when the hash doesn't match or decode fails.
 */
export async function decodeShareHash(hash: string): Promise<{
  project: SerializedProject;
  graph: Graph;
  positions: Record<string, NodePosition>;
  warnings: string[];
} | null> {
  const m = /[#&]share=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const bytes = base64UrlToBytes(m[1]);
    const decompressed = await gunzip(bytes);
    const json = new TextDecoder().decode(decompressed);
    const project = JSON.parse(json) as SerializedProject;
    const parsed = deserializeProject(project);
    return {
      project,
      graph: parsed.graph,
      positions: parsed.positions,
      warnings: parsed.warnings,
    };
  } catch {
    return null;
  }
}

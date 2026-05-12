import type { ComputeAttributeSize, ComputeSeed } from "./types";

/**
 * Generate the initial Float32Array for a ComputeNode attribute slot.
 *
 * The result has `count * size` floats. Seed shape semantics:
 *   - `sphere`: points uniformly scattered inside the unit sphere (size 3 → xyz;
 *     size 1 → radial length; size 2 → xy disk; size 4 → xyz + 1)
 *   - `cube`:   points uniformly in [-1, 1]^n on each component
 *   - `random`: components in [-1, 1] (no normalization)
 *   - `zero`:   all zeros
 *
 * Deterministic: every call seeds the same internal LCG with `seed + count +
 * size` so unit tests can compare against fixed expectations.
 */
export function generateSeed(
  seed: ComputeSeed,
  count: number,
  size: ComputeAttributeSize,
): Float32Array {
  const out = new Float32Array(count * size);
  if (seed === "zero") return out;

  const rng = makeRng(hashSeed(seed, count, size));

  if (seed === "cube" || seed === "random") {
    for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1;
    return out;
  }

  // sphere
  for (let i = 0; i < count; i++) {
    // Rejection sampling for size >= 2; for size 1 just take a radius.
    if (size === 1) {
      out[i] = rng();
      continue;
    }
    while (true) {
      const x = rng() * 2 - 1;
      const y = rng() * 2 - 1;
      const z = size >= 3 ? rng() * 2 - 1 : 0;
      const w = size >= 4 ? rng() * 2 - 1 : 0;
      if (x * x + y * y + z * z + w * w <= 1) {
        const base = i * size;
        out[base] = x;
        if (size >= 2) out[base + 1] = y;
        if (size >= 3) out[base + 2] = z;
        if (size >= 4) out[base + 3] = w;
        break;
      }
    }
  }
  return out;
}

function hashSeed(seed: ComputeSeed, count: number, size: number): number {
  let h = 2166136261;
  const s = `${seed}|${count}|${size}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS_DIR = "dist/assets";

// Bundle-size gate (`npm run size:check`, CI `bundle-size` job; run after
// `npm run build`). Two gzip-9 budgets:
//   - entry: the isEntry chunk(s) from dist/.vite/manifest.json — what the
//     user's first load actually waits on (the real gate);
//   - total: every dist/assets/*.js — a loose safety net so chunk-count
//     growth from code-splitting can't let the aggregate run away unnoticed.
//
// gzip output depends on Node's bundled zlib: Node 22 (`.nvmrc`, all CI jobs)
// uses stock zlib, Node >= 24 uses zlib-ng and reports ~1.8 KiB smaller on
// this bundle. A local PASS on Node >= 24 is not a CI pass — re-measure on
// Node 22 before spending headroom (`reportNodeContext` warns on mismatch).
//
// How each limit got its current value (and why it was raised):
// docs/archive/bundle-budget-history.md.
const LIMITS_KIB = {
  entry: 375,
  total: 430,
};

/** Node major that CI pins via `.nvmrc`; null when unreadable. */
function ciNodeMajor() {
  try {
    const raw = readFileSync(".nvmrc", "utf8").trim().replace(/^v/, "");
    const major = Number.parseInt(raw, 10);
    return Number.isNaN(major) ? null : major;
  } catch {
    return null;
  }
}

/**
 * gzip output is implementation-defined, so the number this script prints is
 * only the gate's number when the running Node matches CI's. Announce the
 * mismatch loudly instead of letting a local PASS masquerade as a green gate.
 */
function reportNodeContext() {
  const running = Number.parseInt(process.versions.node, 10);
  const ci = ciNodeMajor();
  console.log(
    `[bundle-size] node ${process.versions.node} (zlib ${process.versions.zlib})`,
  );
  if (ci === null || ci === running) return;
  console.warn(
    `[bundle-size] WARNING: CI runs Node ${ci} (.nvmrc) — this is Node ${running}.\n` +
      `[bundle-size] Node >= 24 uses zlib-ng and compressed this bundle ~1.8 KiB\n` +
      `[bundle-size] tighter than Node ${ci} at the same level, so this run's\n` +
      `[bundle-size] total is NOT the gate's number. A PASS here does not mean\n` +
      `[bundle-size] the CI bundle-size job passes — re-measure on Node ${ci}.`,
  );
}

const KIB = 1024;

function formatKiB(bytes) {
  return `${(bytes / KIB).toFixed(2)} KiB`;
}

function listAssets(extension) {
  let entries;
  try {
    entries = readdirSync(ASSETS_DIR);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.error(
        `[bundle-size] ${ASSETS_DIR} not found — run \`npm run build\` first.`,
      );
      process.exit(2);
    }
    throw err;
  }
  return entries
    .filter((name) => name.endsWith(extension))
    .map((name) => join(ASSETS_DIR, name));
}

const MANIFEST_PATH = "dist/.vite/manifest.json";

/**
 * Entry chunk(s) per `dist/.vite/manifest.json` (`build.manifest: true` in
 * vite.config.ts). This is what the user's first load actually pays for —
 * unlike a filename pattern (fragile) or parsing `dist/index.html` (needs
 * `base`-prefix handling), the manifest's `file` paths are dist-relative and
 * unaffected by the GITHUB_PAGES `base` swap.
 */
function listEntryChunks() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    console.error(
      `[bundle-size] ${MANIFEST_PATH} not found/unreadable — vite build.manifest must be on; run npm run build`,
    );
    process.exit(2);
  }
  const entries = Object.values(manifest)
    .filter(
      (e) =>
        e &&
        e.isEntry === true &&
        typeof e.file === "string" &&
        e.file.endsWith(".js"),
    )
    .map((e) => join("dist", e.file));
  if (entries.length === 0) {
    console.error(`[bundle-size] no isEntry chunk found in ${MANIFEST_PATH}`);
    process.exit(2);
  }
  return entries;
}

function measure(paths) {
  return paths.map((path) => {
    const buf = readFileSync(path);
    const gz = gzipSync(buf, { level: 9 });
    return { path, raw: buf.length, gzip: gz.length };
  });
}

function checkGroup(label, paths, limitKiB) {
  const results = measure(paths);
  const totalGzip = results.reduce((acc, r) => acc + r.gzip, 0);
  const limit = limitKiB * KIB;

  console.log(`\n${label} — limit ${limitKiB} KiB gzip (total)`);
  for (const r of results) {
    console.log(
      `  ${r.path}: raw=${formatKiB(r.raw)} gzip=${formatKiB(r.gzip)}`,
    );
  }
  console.log(
    `  total: gzip=${formatKiB(totalGzip)} (${totalGzip}B / ${limit}B)`,
  );

  if (totalGzip > limit) {
    console.error(
      `  FAIL — ${label} total gzip ${formatKiB(totalGzip)} exceeds ${limitKiB} KiB`,
    );
    return false;
  }
  console.log(`  OK`);
  return true;
}

reportNodeContext();

const jsFiles = listAssets(".js");
if (jsFiles.length === 0) {
  console.error(`[bundle-size] no JS bundles found in ${ASSETS_DIR}`);
  process.exit(2);
}

const entryFiles = listEntryChunks();
const entryOk = checkGroup("JS (entry chunk)", entryFiles, LIMITS_KIB.entry);
const totalOk = checkGroup("JS (all chunks)", jsFiles, LIMITS_KIB.total);
process.exit(entryOk && totalOk ? 0 : 1);

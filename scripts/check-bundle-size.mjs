#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS_DIR = "dist/assets";

// Phase 33 (GIF per-frame palette + dithering): bumped 360 → 363. The budget
// was already ~100 B under the CI gzip ceiling on `main`, so even after moving
// the Floyd–Steinberg pass into the worker-only chunk the remaining local-
// palette plumbing pushed the total over. Raised with explicit sign-off rather
// than dropping the feature.
//
// Design handoff v1 reskin (M0~M8, PR #68): bumped 363 → 385. The full UI
// redesign added ~17 KiB gzip of genuinely new surface (AppToolbar + docking
// shell, Export & Share dialog, form-control library, system-state screens,
// connection motion) — measured 379.58 KiB locally. Code-splitting can't help:
// this gate sums ALL chunks. Raised with explicit user sign-off; the extra
// ~5 KiB headroom absorbs gzip variance across Node versions (CI runs 22).
//
// Design handoff v1.4 docking (Phase B): bumped 385 → 393. Turning the fixed
// 4-panel layout into the tree-based dock model (dockTree/dockStore, drag-drop
// engine, status-bar overlays, header chrome) is genuinely new surface —
// measured 388.48 KiB locally. Same rationale as the reskin bump: core layout
// code, not deferrable behind a dynamic import. Raised with explicit user
// sign-off; ~4.5 KiB headroom left for the v1.5 follow-ups.
//
// Measurement correction (2026-07-29, review/2026-07): every "measured … KiB
// locally" figure above was taken on a dev machine's Node, not CI's, and the
// two do not agree. Node >= 24 bundles zlib-ng; Node 22 (`.nvmrc`, what all
// three CI jobs pin via node-version-file) bundles stock zlib. Same dist, same
// level 9, ~1.8 KiB apart on this bundle — Node 26 reports 390.18 KiB for
// `main` (ea2de84) where Node 22 reports 391.98 KiB. So the real headroom under
// this 393 KiB ceiling is 1.02 KiB, not the ~4.5 KiB quoted above, and a local
// PASS on Node >= 24 does not mean the CI `bundle-size` job passes. Re-measure
// on Node 22 before spending headroom (`npm i --prefix <tmp> node@22`, then run
// this script with that binary against an already-built dist).
//
// Full-project code review (review/2026-07): bumped 393 → 396. The review
// landed 42 adversarially-verified fixes across ten batches and they cost
// +1.97 KiB gzip in total (Node 22: 391.98 → 393.95), overshooting the old
// ceiling by 0.95 KiB. No single item is the culprit — the cost is spread
// thinly (largest contributors: B4 GLSL comment masker +0.54, B9 viewport
// +0.32, B10 assets/GIF +0.30) and every byte belongs to a defect fix, not a
// feature. The three standalone-player fixes were measured as revert
// candidates first, per the plan's deferral clause: reverting them moves the
// total to 393.96 KiB (+6 B — gzip noise), because minifyStandalonePlayer
// runs esbuild over that file before inlining it, so their real code is below
// measurement resolution. Dropping them would have lost three export bugs and
// still left CI red. Raised with explicit user sign-off; the ~2.05 KiB
// headroom is deliberate slack for gzip variance, since the previous nominal
// headroom turned out to be measurement error.
const LIMITS_KIB = {
  js: 396,
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

const ok = checkGroup("JS", jsFiles, LIMITS_KIB.js);
process.exit(ok ? 0 : 1);

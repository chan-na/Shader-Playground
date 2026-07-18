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
const LIMITS_KIB = {
  js: 393,
};

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

const jsFiles = listAssets(".js");
if (jsFiles.length === 0) {
  console.error(`[bundle-size] no JS bundles found in ${ASSETS_DIR}`);
  process.exit(2);
}

const ok = checkGroup("JS", jsFiles, LIMITS_KIB.js);
process.exit(ok ? 0 : 1);

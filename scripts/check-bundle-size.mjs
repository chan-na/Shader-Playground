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
const LIMITS_KIB = {
  js: 363,
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

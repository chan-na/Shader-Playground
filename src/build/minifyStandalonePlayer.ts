import { readFile } from "node:fs/promises";
import { type Plugin, transformWithEsbuild } from "vite";

/**
 * The standalone export player (`src/export/standalonePlayer.js`, ~40 KB) is
 * inlined verbatim into exported HTML via a `?raw` import. That import also
 * embeds its full, unminified source into the app's main bundle, where it is
 * the single largest app-authored contributor (~10 KB gzip). This plugin
 * minifies the raw string at build/serve time with esbuild so both the app
 * bundle and the exported HTML ship the compact form.
 *
 * The on-disk source stays readable (it is `?raw`, so authors keep the
 * annotated original), and the minified player's runtime behaviour is covered
 * by the phase-11 E2E, which mounts the exported HTML in an iframe and asserts
 * it renders pixels. Applying in every mode (not build-only) keeps what the
 * E2E dev server exercises identical to what ships.
 */
export function minifyStandalonePlayerPlugin(): Plugin {
  return {
    name: "shaderplayground-minify-standalone-player",
    enforce: "pre",
    async load(id) {
      const queryIndex = id.indexOf("?");
      if (queryIndex < 0) return null;
      const path = id.slice(0, queryIndex);
      const query = id.slice(queryIndex + 1);
      if (!path.endsWith("standalonePlayer.js")) return null;
      if (!query.split("&").includes("raw")) return null;

      const source = await readFile(path, "utf8");
      const { code } = await transformWithEsbuild(source, path, {
        minify: true,
        loader: "js",
      });
      // Mirror Vite's built-in `?raw` output — a module whose default export is
      // the file text — but minified.
      return `export default ${JSON.stringify(code.replace(/\n$/, ""))};`;
    },
  };
}

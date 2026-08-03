import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cspMetaPlugin } from "./src/build/cspMetaPlugin";
import { minifyStandalonePlayerPlugin } from "./src/build/minifyStandalonePlayer";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/Shader-Playground/" : "/",
  build: { manifest: true },
  plugins: [minifyStandalonePlayerPlugin(), react(), cspMetaPlugin()],
  server: {
    open: false,
    host: "127.0.0.1",
    port: 5173,
  },
});

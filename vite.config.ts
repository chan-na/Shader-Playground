import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cspMetaPlugin } from "./src/build/cspMetaPlugin";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/Shader-Playground/" : "/",
  plugins: [react(), cspMetaPlugin()],
  server: {
    open: false,
    host: "127.0.0.1",
    port: 5173,
  },
});

/**
 * Standalone Playwright config for M0 measurement spikes under tests/measure/.
 * Intentionally separate from playwright.config.ts so `npm run test:e2e`
 * never picks these up; they are run manually with:
 *
 *     npx playwright test --config=playwright.measure.config.ts
 *
 * The webServer / browser flags mirror the main config so measurements run in
 * the same Chromium + SwiftShader env that gates use.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5179);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/measure",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 2,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/browser-results.json" }],
  ],
  use: { baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:8787", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHROME_CHANNEL,
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PLAYWRIGHT_CHROME_CHANNEL,
      },
    },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});

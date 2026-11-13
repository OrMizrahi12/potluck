import { defineConfig, devices } from "@playwright/test";

// Browser tests start from the first page of a running Potluck. They run
// against BASE_URL, or a dev server already running on port 3000 (`npm run dev`).
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // The copy-link control writes to the clipboard; the test reads it back.
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});

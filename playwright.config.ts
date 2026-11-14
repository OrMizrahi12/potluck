import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Browser tests start from the first page of a running Potluck. They run
// against BASE_URL, or the dev server `npm run dev` starts from this checkout:
// on the PORT in .env.local (each worktree has its own), else on 3000.
const port =
  process.env.PORT ??
  (existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8")).PORT
    : undefined) ??
  "3000";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    // The copy-link control writes to the clipboard; the test reads it back.
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});

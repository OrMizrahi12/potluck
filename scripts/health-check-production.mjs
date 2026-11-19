// Runs the hourly health check against one address:
//   HEALTH_URL=https://… node scripts/health-check-production.mjs
// .github/workflows/health.yml runs it every hour. It prints the result,
// writes `summary=` to $GITHUB_OUTPUT for the issue, and exits 1 on a failure.
import { appendFileSync } from "node:fs";
import { checkHealth } from "./health-check.mjs";

/** How long a failing answer waits before it's asked again. */
const RETRY_AFTER_MS = 30 * 1000;

const baseUrl = (process.env.HEALTH_URL ?? "").trim().replace(/\/+$/, "");

const result = /^https:\/\/[^/\s]+$/.test(baseUrl)
  ? await checkHealth({ baseUrl, retryAfterMs: RETRY_AFTER_MS })
  : {
      passed: false,
      summary: "HEALTH_URL isn't an https:// address with no path",
    };

console.log(`${result.passed ? "✓" : "✗"} ${result.summary}`);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `summary=${result.summary}\n`);
process.exit(result.passed ? 0 : 1);

// Runs the smoke test against the production address for one commit:
//   PRODUCTION_URL=https://… SMOKE_COMMIT=<sha> node scripts/smoke-production.mjs
// .github/workflows/smoke.yml runs it after each production deploy. It prints
// one line per step, writes `summary=` to $GITHUB_OUTPUT for the commit
// status, and exits 1 on a failure. Nothing it prints names the address, which
// isn't public until the launch.
import { appendFileSync } from "node:fs";
import { runSmoke } from "./smoke.mjs";

/** How long production gets to report the commit after Vercel says the deploy succeeded. */
const TIMEOUT_MS = 10 * 60 * 1000;
const INTERVAL_MS = 15 * 1000;

const baseUrl = (process.env.PRODUCTION_URL ?? "").trim().replace(/\/+$/, "");
const commit = (process.env.SMOKE_COMMIT ?? "").trim();

const result = !/^https:\/\/[^/\s]+$/.test(baseUrl)
  ? missing("PRODUCTION_URL isn't set to an https:// address")
  : !/^[0-9a-f]{40}$/.test(commit)
    ? missing("SMOKE_COMMIT isn't a full commit SHA")
    : await runSmoke({
        baseUrl,
        commit,
        timeoutMs: TIMEOUT_MS,
        intervalMs: INTERVAL_MS,
      });

for (const line of result.lines) console.log(line);
if (process.env.GITHUB_OUTPUT) {
  // A commit status description holds at most 140 characters.
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `summary=${result.summary.slice(0, 140)}\n`
  );
}
process.exit(result.passed ? 0 : 1);

/** @param {string} summary */
function missing(summary) {
  return { passed: false, summary, lines: [`✗ ${summary}`] };
}

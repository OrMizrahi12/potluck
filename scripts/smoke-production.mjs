// Runs the smoke test against the production address for one commit:
//   PRODUCTION_URL=https://… SMOKE_COMMIT=<sha> node scripts/smoke-production.mjs
// .github/workflows/smoke.yml runs it after each production build succeeds.
// It prints one line per step, writes `summary=` to $GITHUB_OUTPUT for the
// commit status, and exits 1 on a failure.
//
// With GITHUB_REPOSITORY and GH_TOKEN set, it asks GitHub whether a commit
// the address reports instead comes after this one. Without them it never
// assumes so, and waits.
import { appendFileSync } from "node:fs";
import { runSmoke } from "./smoke.mjs";

/** How long production gets to report the commit after Vercel says the build succeeded. */
const TIMEOUT_MS = 10 * 60 * 1000;
const INTERVAL_MS = 15 * 1000;
const SHA = /^[0-9a-f]{40}$/;

const baseUrl = (process.env.PRODUCTION_URL ?? "").trim().replace(/\/+$/, "");
const commit = (process.env.SMOKE_COMMIT ?? "").trim();

const result = !/^https:\/\/[^/\s]+$/.test(baseUrl)
  ? refuse("PRODUCTION_URL isn't set to an https:// address")
  : !SHA.test(commit)
    ? refuse("SMOKE_COMMIT isn't a full commit SHA")
    : await runSmoke({
        baseUrl,
        commit,
        timeoutMs: TIMEOUT_MS,
        intervalMs: INTERVAL_MS,
        isNewer: (seen) => comesAfter(commit, seen),
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
function refuse(summary) {
  return { passed: false, summary, lines: [`✗ ${summary}`] };
}

/**
 * Whether `later` descends from `earlier` in this repo, by GitHub's compare
 * API. Any doubt (no token, a failed request, an odd SHA) answers no.
 *
 * @param {string} earlier
 * @param {string} later
 */
async function comesAfter(earlier, later) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repo || !token || !SHA.test(later)) return false;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/compare/${earlier}...${later}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(30 * 1000),
      }
    );
    if (!response.ok) return false;
    const { status } = await response.json();
    return status === "ahead";
  } catch {
    return false;
  }
}

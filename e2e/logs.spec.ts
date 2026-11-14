import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// What `npm run dev` prints, copied to a file (scripts/dev.mjs). Only a
// server started that way from this checkout can be read; a deployed one can't.
const DEV_LOG = path.resolve(".data/logs/dev-latest.log");

/** A documentation-only address (RFC 5737): it can't be anyone's. */
const CLIENT_IP = "203.0.113.7";

test("the server doesn't log a writer's IP address", async ({ browser }) => {
  test.skip(
    !!process.env.BASE_URL || !existsSync(DEV_LOG),
    "needs the dev server's log: run `npm run dev` in this checkout"
  );

  // The headers a proxy or Vercel sets to carry the visitor's address.
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-for": CLIENT_IP,
      "x-real-ip": CLIENT_IP,
      "x-vercel-forwarded-for": CLIENT_IP,
    },
  });
  const page = await context.newPage();
  const logStart = statSync(DEV_LOG).size;
  const loggedSinceStart = () =>
    readFileSync(DEV_LOG).subarray(logStart).toString("utf8");

  await page.goto("/");
  await page.getByLabel("Group name").fill(`Logs ${Date.now()}`);
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByLabel("Member 1", { exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22,}$/);

  // The log has caught up once it shows the write, which it prints when the
  // request has finished (the page it redirects to renders in the same request).
  await expect
    .poll(loggedSinceStart)
    .toMatch(/POST \/ [\s\S]*createGroupAction/);
  expect(loggedSinceStart()).not.toContain(CLIENT_IP);
  await context.close();
});

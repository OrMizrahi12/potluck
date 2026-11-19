import { expect, test } from "@playwright/test";

// #67's test error throws only on a production deploy's own URL, behind
// deployment protection. Anywhere a browser test runs, it isn't there.
test("the test error answers 404 off a deploy's own URL", async ({
  request,
}) => {
  const answer = await request.get("/api/test-error/g/SentryTestNotARealLink");
  expect(answer.status()).toBe(404);
});

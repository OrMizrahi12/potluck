import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, screenshot, watchForErrors } from "./helpers";

// Chromium logs this for any page answered with a 404. Here the 404 is the
// answer we want, so it isn't an error.
const CHROMIUM_404_CONSOLE_ERROR =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";

// Each step waits for the network to go quiet before leaving the page: in dev,
// an error Next finds while validating the page reaches the browser only after
// the page has loaded, and leaving sooner would miss it.
test("a link that can't be a group link answers like one no group has", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);

  await test.step("open a link no group has", async () => {
    const response = await page.goto("/g/AAAAAAAAAAAAAAAAAAAAAA");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "No group at this link"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-unknown-group-link");
    await page.waitForLoadState("networkidle");
  });

  await test.step("open a link that can't be a group link", async () => {
    const response = await page.goto("/g/wp-login.php");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "No group at this link"
    );
    await expect(
      page.getByRole("link", { name: "Create a group" })
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-malformed-group-link");
    await page.waitForLoadState("networkidle");
  });

  expect(
    errors.filter((error) => error !== CHROMIUM_404_CONSOLE_ERROR),
    "browser errors"
  ).toEqual([]);
});

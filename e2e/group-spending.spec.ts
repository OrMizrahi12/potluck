import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// Amounts are formatted for the visitor's locale; pin it so the text is known.
test.use({ locale: "en-US" });

/** The element directly above the Balances heading. */
function lineAboveBalances(page: Page) {
  return page
    .getByRole("heading", { name: "Balances" })
    .locator("xpath=preceding-sibling::*[1]");
}

test("group spending sits above balances and adds up the expenses", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Porto trip (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("a new group's spending is zero", async () => {
    await expect(lineAboveBalances(page)).toHaveText("Group spending: €0.00");
  });

  await test.step("adding expenses adds their amounts", async () => {
    for (const [description, amount] of [
      ["Dinner", "30.50"],
      ["Taxi", "12.25"],
    ]) {
      await page.getByRole("link", { name: "Add an expense" }).click();
      await page.getByLabel("Description").fill(description);
      await page.getByLabel("Amount (EUR)").fill(amount);
      await page.getByLabel("Paid by").selectOption({ label: "Ana" });
      await page.getByRole("button", { name: "Add expense" }).click();
      await expect(
        page.getByRole("heading", { name: "Balances" })
      ).toBeVisible();
    }

    // €30.50 + €12.25 = €42.75.
    await expect(lineAboveBalances(page)).toHaveText("Group spending: €42.75");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-group-spending");
  });

  expect(errors, "browser errors").toEqual([]);
});

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

function balances(page: Page) {
  return page.getByRole("list", { name: "Balances" }).getByRole("listitem");
}

function sharesOf(page: Page, description: string) {
  return page
    .getByRole("listitem", { name: description })
    .getByRole("list", { name: "Shares" })
    .getByRole("listitem");
}

test("add a yen expense and see shares and balances with no decimals", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Tokyo trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await sayWhoYouAre(page, "Ana");
  await expect(balances(page)).toHaveText([
    "Ana settled up",
    "Ben settled up",
    "Chloé settled up",
  ]);

  await test.step("an amount with decimals is refused for yen", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Ramen");
    await page.getByLabel("Amount (JPY)").fill("900.50");
    await page.getByLabel("Paid by").selectOption({ label: "Ana" });
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(
      page.getByRole("form", { name: "Add an expense" }).getByRole("alert")
    ).toHaveText("Type the amount as a whole number, like 1500.");
  });

  await test.step("record the expense, split among all members by default", async () => {
    // Every member is ticked by default; the date defaults to today.
    for (const name of ["Ana", "Ben", "Chloé"]) {
      await expect(page.getByRole("checkbox", { name })).toBeChecked();
    }
    await expect(page.getByLabel("Date")).not.toHaveValue("");
    await page.getByLabel("Amount (JPY)").fill("900");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-yen-expense-form");
    await page.getByRole("button", { name: "Add expense" }).click();
  });

  await test.step("see every share and every balance", async () => {
    // ¥900 among three is ¥300 each; Ana paid ¥900 and is owed ¥600.
    await expect(sharesOf(page, "Ramen")).toHaveText([
      "Ana ¥300",
      "Ben ¥300",
      "Chloé ¥300",
    ]);
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥600",
      "Ben owes ¥300",
      "Chloé owes ¥300",
    ]);
  });

  await test.step("a leftover yen is marked on the share that got it", async () => {
    // ¥10 among three is ¥3 each with ¥1 left over for one participant.
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Gum");
    await page.getByLabel("Amount (JPY)").fill("10");
    await page.getByLabel("Paid by").selectOption({ label: "Ben" });
    await page.getByRole("button", { name: "Add expense" }).click();

    const gum = sharesOf(page, "Gum");
    await expect(gum).toHaveCount(3);
    await expect(gum.filter({ hasText: "¥4 · rounded up" })).toHaveCount(1);
    await expect(gum.filter({ hasText: /¥3$/ })).toHaveCount(2);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-yen-shares-and-balances");
  });

  expect(errors, "browser errors").toEqual([]);
});

test("add a forint gift and see two decimals, as ISO 4217 has it", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Budapest flat (${testInfo.project.name} ${Date.now()})`,
    currency: "HUF",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await sayWhoYouAre(page, "Chloé");

  await test.step("an amount too small to split is refused", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Flowers");
    await page.getByLabel("Amount (HUF)").fill("0.01");
    await page.getByLabel("Paid by").selectOption({ label: "Chloé" });
    await page.getByRole("checkbox", { name: "Chloé" }).uncheck();
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(
      page.getByRole("form", { name: "Add an expense" }).getByRole("alert")
    ).toHaveText("This amount is too small to split among 2.");
  });

  await test.step("record a gift Chloé paid for Ana and Ben", async () => {
    await page.getByLabel("Amount (HUF)").fill("12.34");
    await page.getByRole("button", { name: "Add expense" }).click();

    // HUF 12.34 between two is HUF 6.17 each; browsers would show HUF with no decimals.
    await expect(sharesOf(page, "Flowers")).toHaveText([
      /^Ana HUF\s6\.17$/,
      /^Ben HUF\s6\.17$/,
    ]);
    await expect(balances(page)).toHaveText([
      /^Ana owes HUF\s6\.17$/,
      /^Ben owes HUF\s6\.17$/,
      /^Chloé is owed HUF\s12\.34$/,
    ]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-forint-gift");
  });

  expect(errors, "browser errors").toEqual([]);
});

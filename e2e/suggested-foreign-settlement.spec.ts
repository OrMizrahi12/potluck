import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// The dev server asks the fake rate source (src/group/fake-frankfurter.ts):
// CHF 1.0463 and JPY 0.0062 on the asked date.

// Amounts and dates are formatted for the visitor's locale; pin it.
test.use({ locale: "en-US" });

function form(page: Page) {
  return page.getByRole("form", { name: "Record a settlement" });
}

function quietLine(page: Page) {
  return form(page).getByText(/^= €/);
}

function balances(page: Page) {
  return page.getByRole("list", { name: "Balances" }).getByRole("listitem");
}

function suggestions(page: Page) {
  return page
    .getByRole("list", { name: "Suggested settlements" })
    .getByRole("listitem");
}

function settlementRows(page: Page) {
  return page
    .getByRole("list", { name: "Settlements", exact: true })
    .getByRole("listitem");
}

/** Taps "Record this settlement" on the suggestion that reads `text`. */
async function recordSuggestion(page: Page, text: string) {
  await suggestions(page)
    .filter({ hasText: text })
    .getByRole("link", { name: "Record this settlement" })
    .click();
}

test("switch a suggested settlement to another currency and settle up", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Zermatt trip (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Cai"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("Ana pays €90.00 for all three", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Fondue");
    await page.getByLabel("Amount (EUR)").fill("90.00");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(suggestions(page)).toHaveText([
      /^Ben pays Ana €30\.00/,
      /^Cai pays Ana €30\.00/,
    ]);
  });

  await test.step("Ben switches his suggested settlement to francs", async () => {
    await recordSuggestion(page, "Ben pays Ana");
    await expect(form(page).getByLabel("Amount (EUR)")).toHaveValue("30.00");
    await form(page).getByLabel("Currency").selectOption("CHF");
    // €30.00 ÷ 1.0463 = 28.672465… CHF, proposed as CHF 28.67; the
    // group-currency amount stays the suggested €30.00.
    await expect(form(page).getByLabel("Amount (CHF)")).toHaveValue("28.67");
    await expect(quietLine(page)).toHaveText(
      "= €30.00 · 1 CHF = 1.0463 EUR · rate from Frankfurter"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-worked-backwards");
  });

  await test.step("save: Ben and Ana are settled up between them", async () => {
    await form(page).getByRole("button", { name: "Record settlement" }).click();
    await expect(settlementRows(page)).toHaveCount(1);
    await expect(settlementRows(page).first()).toContainText(
      /Ben paid Ana €30\.00 \(CHF\s28\.67\)/
    );
    await expect(balances(page)).toHaveText([
      "Ana is owed €30.00",
      "Ben settled up",
      "Cai owes €30.00",
    ]);
    await expect(suggestions(page)).toHaveText([/^Cai pays Ana €30\.00/]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-settled-up");
  });

  await test.step("Cai switches his to yen, then types what he handed over", async () => {
    await recordSuggestion(page, "Cai pays Ana");
    await form(page).getByLabel("Currency").selectOption("JPY");
    // €30.00 ÷ 0.0062 = 4838.709… JPY, proposed as ¥4839.
    await expect(form(page).getByLabel("Amount (JPY)")).toHaveValue("4839");
    await expect(quietLine(page)).toHaveText(
      "= €30.00 · 1 JPY = 0.0062 EUR · rate from Frankfurter"
    );
    await form(page).getByLabel("Amount (JPY)").fill("4800");
    // Typed, it converts forward: ¥4800 × 0.0062 = 29.76 EUR.
    await expect(quietLine(page)).toHaveText(
      "= €29.76 · 1 JPY = 0.0062 EUR · rate from Frankfurter"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-typed-foreign-amount");
  });

  await test.step("save: a small remainder stays between Cai and Ana", async () => {
    await form(page).getByRole("button", { name: "Record settlement" }).click();
    await expect(settlementRows(page)).toHaveCount(2);
    await expect(
      settlementRows(page).filter({ hasText: "Cai paid Ana" })
    ).toContainText(/Cai paid Ana €29\.76 \(¥4,800\)/);
    // €30.00 − €29.76 = €0.24 left over.
    await expect(balances(page)).toHaveText([
      "Ana is owed €0.24",
      "Ben settled up",
      "Cai owes €0.24",
    ]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "4-small-remainder");
  });

  expect(errors).toEqual([]);
});

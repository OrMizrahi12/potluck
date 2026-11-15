import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// The dev server asks the fake rate source (src/group/fake-frankfurter.ts):
// USD 0.925926, CHF 1.0463 and JPY 0.0062 on the asked date.

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

function settlementRows(page: Page) {
  return page
    .getByRole("list", { name: "Settlements", exact: true })
    .getByRole("listitem");
}

/** Opens the settlement form with `from` paying `to` on 10 Nov 2026. */
async function startSettlement(page: Page, from: string, to: string) {
  await page.getByRole("link", { name: "Record a settlement" }).click();
  await form(page).getByLabel("From").selectOption({ label: from });
  await form(page).getByLabel("To").selectOption({ label: to });
  await form(page).getByLabel("Date").fill("2026-11-10");
}

test("record settlements in another currency, at Frankfurter's rate and at the bank's amount", async ({
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
    await expect(balances(page)).toHaveText([
      "Ana is owed €60.00",
      "Ben owes €30.00",
      "Cai owes €30.00",
    ]);
  });

  await test.step("Cai hands Ana dollars: Frankfurter's rate is proposed", async () => {
    await startSettlement(page, "Cai", "Ana");
    await form(page).getByLabel("Currency").selectOption("USD");
    await form(page).getByLabel("Amount (USD)").fill("32.40");
    // $32.40 × 0.925926 = 30.0000024 EUR, which is €30.00.
    await expect(quietLine(page)).toHaveText(
      "= €30.00 · 1 USD = 0.925926 EUR · rate from Frankfurter"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-looked-up-rate");
  });

  await test.step("save: the row leads with euros, dollars beside in grey", async () => {
    await form(page).getByRole("button", { name: "Record settlement" }).click();
    await expect(settlementRows(page)).toHaveCount(1);
    const row = settlementRows(page).first();
    await expect(row).toContainText("Cai paid Ana €30.00 ($32.40)");
    await expect(row.locator(".muted").first()).toHaveText("($32.40)");
    // Cai's balance rises by €30.00 and Ana's falls by the same.
    await expect(balances(page)).toHaveText([
      "Ana is owed €30.00",
      "Ben owes €30.00",
      "Cai settled up",
    ]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-looked-up-rate-row");
  });

  await test.step("a foreign amount that converts to zero is named before saving", async () => {
    await startSettlement(page, "Ben", "Ana");
    await form(page).getByLabel("Currency").selectOption("JPY");
    await form(page).getByLabel("Amount (JPY)").fill("1");
    await form(page)
      .getByRole("button", { name: "Use another rate or my bank's amount" })
      .click();
    // ¥1 × 0.004 = 0.004 EUR, which rounds to €0.00.
    await form(page).getByLabel("Exchange rate (1 JPY = ? EUR)").fill("0.004");
    await expect(form(page).getByRole("status")).toHaveText(
      "This converts to less than €0.01."
    );
    await screenshot(page, testInfo, "3-converts-to-zero");
  });

  await test.step("Ben hands Ana francs and types what his bank charged", async () => {
    await form(page).getByLabel("Currency").selectOption("CHF");
    await form(page).getByLabel("Amount (CHF)").fill("28");
    await expect(quietLine(page)).toHaveText(
      "= €29.30 · 1 CHF = 1.0463 EUR · rate from Frankfurter"
    );
    await form(page)
      .getByRole("button", { name: "Use another rate or my bank's amount" })
      .click();
    await form(page)
      .getByLabel("Or what your bank charged (EUR)")
      .fill("29.50");
    // €29.50 ÷ CHF 28.00 = 1.0535714…, shown as 1.05357.
    await expect(quietLine(page)).toHaveText(
      "= €29.50 · 1 CHF = 1.05357 EUR · typed"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "4-bank-amount");
  });

  await test.step("save: both rows and the balances", async () => {
    await form(page).getByRole("button", { name: "Record settlement" }).click();
    await expect(settlementRows(page)).toHaveCount(2);
    await expect(
      settlementRows(page).filter({ hasText: "Ben paid Ana" })
    ).toContainText(/Ben paid Ana €29\.50 \(CHF\s28\.00\)/);
    // Ben's balance rises by €29.50; 50 cents stay between him and Ana.
    await expect(balances(page)).toHaveText([
      "Ana is owed €0.50",
      "Ben owes €0.50",
      "Cai settled up",
    ]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "5-bank-amount-row");
  });

  expect(errors).toEqual([]);
});

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

function expenseRow(page: Page, description: string) {
  return page.getByRole("listitem", { name: description });
}

function form(page: Page) {
  return page.getByRole("form", { name: "Add an expense" });
}

async function startExpense(page: Page, description: string) {
  await page.getByRole("link", { name: "Add an expense" }).click();
  await form(page).getByLabel("Description").fill(description);
}

test("record an expense in another currency at a typed rate", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Zermatt trip (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("the currency picker defaults to the group currency", async () => {
    await startExpense(page, "Fondue");
    await expect(form(page).getByLabel("Currency")).toHaveValue("EUR");
    await expect(form(page).getByLabel("Amount (EUR)")).toBeVisible();
    await expect(form(page).getByLabel(/Exchange rate/)).toBeHidden();
  });

  await test.step("pick francs and type the rate", async () => {
    await form(page).getByLabel("Currency").selectOption("CHF");
    await form(page).getByLabel("Amount (CHF)").fill("48");
    await form(page).getByLabel("Exchange rate (1 CHF = ? EUR)").fill("1.0463");
    // CHF 48.00 × 1.0463 = 50.2224 EUR, which is €50.22.
    await expect(form(page).getByText(/^= €/)).toHaveText(
      "= €50.22 · 1 CHF = 1.0463 EUR · typed"
    );
    await expect(
      form(page).getByLabel("Or what your bank charged (EUR)")
    ).toHaveValue("50.22");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-typed-rate");
  });

  await test.step("changing the foreign amount keeps the rate", async () => {
    // CHF 50.00 × 1.0463 = 52.315 EUR: half a cent, rounded up to €52.32.
    await form(page).getByLabel("Amount (CHF)").fill("50");
    await expect(
      form(page).getByLabel("Exchange rate (1 CHF = ? EUR)")
    ).toHaveValue("1.0463");
    await expect(
      form(page).getByLabel("Or what your bank charged (EUR)")
    ).toHaveValue("52.32");
    await form(page).getByLabel("Amount (CHF)").fill("48");
    await form(page).getByRole("button", { name: "Add expense" }).click();
  });

  await test.step("see the list row and balances in the group currency", async () => {
    const row = expenseRow(page, "Fondue");
    await expect(row.locator(".expense-head")).toHaveText("Fondue€50.22");
    await expect(row.locator("p.muted")).toContainText(
      /^Paid CHF\s48\.00 at 1 CHF = 1\.0463 EUR · Paid by Ana · /
    );
    // €50.22 between two is €25.11 each.
    await expect(
      row.getByRole("list", { name: "Shares" }).getByRole("listitem")
    ).toHaveText(["Ana €25.11", "Ben €25.11"]);
    await expect(balances(page)).toHaveText([
      "Ana is owed €25.11",
      "Ben owes €25.11",
    ]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-typed-rate-row");
  });

  expect(errors).toEqual([]);
});

test("record an expense in another currency at the amount the bank charged", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `New York trip (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("pick dollars and type what the bank charged", async () => {
    await startExpense(page, "Museum");
    await form(page).getByLabel("Currency").selectOption("USD");
    await form(page).getByLabel("Amount (USD)").fill("48.60");
    await form(page)
      .getByLabel("Or what your bank charged (EUR)")
      .fill("45.00");
    // €45.00 ÷ $48.60 = 0.925925…, shown as 0.925926.
    await expect(
      form(page).getByLabel("Exchange rate (1 USD = ? EUR)")
    ).toHaveValue("0.925926");
    await expect(form(page).getByText(/^= €/)).toHaveText(
      "= €45.00 · 1 USD = 0.925926 EUR · typed"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-bank-amount");
  });

  await test.step("changing the foreign amount keeps the bank amount", async () => {
    // €45.00 ÷ $50.00 = 0.9.
    await form(page).getByLabel("Amount (USD)").fill("50");
    await expect(
      form(page).getByLabel("Or what your bank charged (EUR)")
    ).toHaveValue("45.00");
    await expect(
      form(page).getByLabel("Exchange rate (1 USD = ? EUR)")
    ).toHaveValue("0.9");
    await form(page).getByLabel("Amount (USD)").fill("48.60");
    await form(page).getByRole("button", { name: "Add expense" }).click();
  });

  await test.step("see what was really paid on the list row, and balances", async () => {
    const row = expenseRow(page, "Museum");
    await expect(row.locator(".expense-head")).toHaveText("Museum€45.00");
    await expect(row.locator("p.muted")).toContainText(
      /^Paid \$48\.60 at 1 USD = 0\.925926 EUR · Paid by Ana · /
    );
    // €45.00 between two is €22.50 each.
    await expect(balances(page)).toHaveText([
      "Ana is owed €22.50",
      "Ben owes €22.50",
    ]);
    await screenshot(page, testInfo, "4-bank-amount-row");
  });

  expect(errors).toEqual([]);
});

test("the form names a converted figure it can't record before saving", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Hanoi trip (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");
  await startExpense(page, "Gum");

  await test.step("too small to split", async () => {
    // ¥1 × 0.0062 = 0.0062 EUR, which rounds half up to €0.01.
    await form(page).getByLabel("Currency").selectOption("JPY");
    await form(page).getByLabel("Amount (JPY)").fill("1");
    await form(page).getByLabel("Exchange rate (1 JPY = ? EUR)").fill("0.0062");
    await expect(form(page).getByRole("status")).toHaveText(
      "€0.01 is too small to split among 2."
    );
    await form(page).getByRole("button", { name: "Add expense" }).click();
    // The refusal on saving says the same, once.
    await expect(form(page).getByText("is too small to split")).toHaveCount(1);
    await expect(form(page).getByRole("status")).toHaveText(
      "€0.01 is too small to split among 2."
    );
  });

  await test.step("over the cap", async () => {
    // 300,000,000,000 VND × 0.0000345 = 10,350,000 EUR.
    await form(page).getByLabel("Currency").selectOption("VND");
    await form(page).getByLabel("Amount (VND)").fill("300000000000");
    await form(page)
      .getByLabel("Exchange rate (1 VND = ? EUR)")
      .fill("0.0000345");
    await expect(form(page).getByRole("status")).toHaveText(
      "This converts to more than 10,000,000 EUR, the most one expense can be."
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "5-over-the-cap");
  });

  expect(errors).toEqual([]);
});

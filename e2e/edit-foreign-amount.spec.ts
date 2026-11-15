import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// The dev server asks the fake rate source (src/group/fake-frankfurter.ts):
// CHF 1.0463 and USD 0.925926 on the asked date; HUF is down.

// Amounts and dates are formatted for the visitor's locale; pin it.
test.use({ locale: "en-US" });

function balances(page: Page) {
  return page.getByRole("list", { name: "Balances" }).getByRole("listitem");
}

function settlementRows(page: Page) {
  return page
    .getByRole("list", { name: "Settlements", exact: true })
    .getByRole("listitem");
}

/** The form named `name`: pages visited earlier stay in the document, hidden. */
function form(page: Page, name: string) {
  return page.getByRole("form", { name });
}

function quietLine(page: Page, formName: string) {
  return form(page, formName).getByText(/^= €/);
}

/**
 * Adds Ana's CHF 48.00 fondue for Ana and Ben on 14 Nov 2026 at a typed rate
 * of 1.05: 48 × 1.05 = 50.40 EUR.
 */
async function addFondueAtTypedRate(page: Page) {
  const add = form(page, "Add an expense");
  await page.getByRole("link", { name: "Add an expense" }).click();
  await add.getByLabel("Description").fill("Fondue");
  await add.getByLabel("Date").fill("2026-11-14");
  await add.getByLabel("Currency").selectOption("CHF");
  await add.getByLabel("Amount (CHF)").fill("48");
  await add
    .getByRole("button", {
      name: /^(Type the rate instead|Use another rate or my bank's amount)$/,
    })
    .click();
  await add.getByLabel("Exchange rate (1 CHF = ? EUR)").fill("1.05");
  await add.getByRole("checkbox", { name: "Cai" }).uncheck();
  await expect(quietLine(page, "Add an expense")).toHaveText(
    "= €50.40 · 1 CHF = 1.05 EUR · typed"
  );
  await add.getByRole("button", { name: "Add expense" }).click();
  await expect(balances(page)).toHaveText([
    "Ana is owed €25.20",
    "Ben owes €25.20",
    "Cai settled up",
  ]);
}

async function zermattGroup(page: Page, projectName: string) {
  await createGroup(page, {
    name: `Zermatt trip (${projectName} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Cai"],
  });
  await sayWhoYouAre(page, "Ana");
}

test("edit an expense's foreign amount and keep its saved rate", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await zermattGroup(page, testInfo.project.name);
  await addFondueAtTypedRate(page);
  const edit = "Edit the expense";

  await test.step("the edit page opens with the saved rate", async () => {
    await page.getByRole("link", { name: "Edit Fondue" }).click();
    await expect(form(page, edit).getByLabel("Currency")).toHaveValue("CHF");
    await expect(form(page, edit).getByLabel("Amount (CHF)")).toHaveValue(
      "48.00"
    );
    await expect(quietLine(page, edit)).toHaveText(
      "= €50.40 · 1 CHF = 1.05 EUR · saved rate"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-edit-saved-rate");
  });

  await test.step("correct the francs: the saved rate stays", async () => {
    await form(page, edit).getByLabel("Description").fill("Fondue at the hut");
    // CHF 50.00 × 1.05 = 52.50 EUR.
    await form(page, edit).getByLabel("Amount (CHF)").fill("50");
    await expect(quietLine(page, edit)).toHaveText(
      "= €52.50 · 1 CHF = 1.05 EUR · saved rate"
    );
    await screenshot(page, testInfo, "2-foreign-amount-corrected");
    await form(page, edit)
      .getByRole("button", { name: "Save changes" })
      .click();
  });

  await test.step("the row and balances follow, at the saved rate", async () => {
    const row = page.getByRole("listitem", { name: "Fondue at the hut" });
    await expect(row.locator(".expense-head")).toHaveText(
      "Fondue at the hut€52.50"
    );
    await expect(row.locator("p.muted")).toContainText(
      /^Paid CHF\s50\.00 at 1 CHF = 1\.05 EUR · Paid by Ana · Nov 14, 2026/
    );
    await expect(balances(page)).toHaveText([
      "Ana is owed €26.25",
      "Ben owes €26.25",
      "Cai settled up",
    ]);
  });

  expect(errors).toEqual([]);
});

test("change an expense's date and take the offered rate", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await zermattGroup(page, testInfo.project.name);
  await addFondueAtTypedRate(page);
  const edit = "Edit the expense";

  await test.step("a new date keeps the saved rate and offers the new date's", async () => {
    await page.getByRole("link", { name: "Edit Fondue" }).click();
    await form(page, edit).getByLabel("Date").fill("2026-11-13");
    await expect(form(page, edit).getByText(/^Rate for /)).toHaveText(
      "Rate for Nov 13, 2026: 1 CHF = 1.0463 EUR · Use this rate"
    );
    await expect(quietLine(page, edit)).toHaveText(
      "= €50.40 · 1 CHF = 1.05 EUR · saved rate"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-rate-offered");
  });

  await test.step("take it: the source note returns", async () => {
    await form(page, edit)
      .getByRole("button", { name: "Use this rate" })
      .click();
    // CHF 48.00 × 1.0463 = 50.2224 EUR, which is €50.22.
    await expect(quietLine(page, edit)).toHaveText(
      "= €50.22 · 1 CHF = 1.0463 EUR · rate from Frankfurter"
    );
    await expect(form(page, edit).getByText(/^Rate for /)).toBeHidden();
    await screenshot(page, testInfo, "4-offered-rate-taken");
    await form(page, edit)
      .getByRole("button", { name: "Save changes" })
      .click();
  });

  await test.step("the row shows the new rate and date", async () => {
    const row = page.getByRole("listitem", { name: "Fondue" });
    await expect(row.locator(".expense-head")).toHaveText("Fondue€50.22");
    await expect(row.locator("p.muted")).toContainText(
      /^Paid CHF\s48\.00 at 1 CHF = 1\.0463 EUR · Paid by Ana · Nov 13, 2026/
    );
    await expect(balances(page)).toHaveText([
      "Ana is owed €25.11",
      "Ben owes €25.11",
      "Cai settled up",
    ]);
  });

  expect(errors).toEqual([]);
});

test("change a settlement's date while the rate source is down, and nothing is offered", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await zermattGroup(page, testInfo.project.name);
  const record = "Record a settlement";
  const edit = "Edit the settlement";

  await test.step("Cai hands Ana forints at a typed rate", async () => {
    await page.getByRole("link", { name: "Record a settlement" }).click();
    await form(page, record).getByLabel("From").selectOption({ label: "Cai" });
    await form(page, record).getByLabel("To").selectOption({ label: "Ana" });
    await form(page, record).getByLabel("Date").fill("2026-11-14");
    await form(page, record).getByLabel("Currency").selectOption("HUF");
    await expect(
      form(page, record).getByText("Couldn't get a rate right now.")
    ).toBeVisible();
    await form(page, record).getByLabel("Amount (HUF)").fill("10000");
    // HUF 10,000.00 × 0.0025 = 25.00 EUR.
    await form(page, record)
      .getByLabel("Exchange rate (1 HUF = ? EUR)")
      .fill("0.0025");
    await form(page, record)
      .getByRole("button", { name: "Record settlement" })
      .click();
    await expect(settlementRows(page).first()).toContainText(
      "Cai paid Ana €25.00"
    );
  });

  await test.step("a new date keeps the saved rate and offers nothing", async () => {
    await settlementRows(page).getByRole("link", { name: /^Edit/ }).click();
    await expect(quietLine(page, edit)).toHaveText(
      "= €25.00 · 1 HUF = 0.0025 EUR · saved rate"
    );
    const asked = page.waitForResponse(
      (r) => r.url().endsWith("/rate") && r.request().method() === "POST"
    );
    await form(page, edit).getByLabel("Date").fill("2026-11-13");
    await asked;
    await expect(quietLine(page, edit)).toHaveText(
      "= €25.00 · 1 HUF = 0.0025 EUR · saved rate"
    );
    await expect(form(page, edit).getByText(/^Rate for /)).toHaveCount(0);
    await expect(
      form(page, edit).getByText("Couldn't get a rate right now.")
    ).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "5-source-down-no-offer");
    await form(page, edit)
      .getByRole("button", { name: "Save changes" })
      .click();
  });

  await test.step("the settlement keeps its saved rate", async () => {
    await expect(settlementRows(page).first()).toContainText(
      "Cai paid Ana €25.00"
    );
    await expect(settlementRows(page).first()).toContainText("Nov 13, 2026");
  });

  expect(errors).toEqual([]);
});

test("switch a settlement back to the group currency", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await zermattGroup(page, testInfo.project.name);
  const record = "Record a settlement";
  const edit = "Edit the settlement";

  await test.step("Cai hands Ana dollars at Frankfurter's rate", async () => {
    await page.getByRole("link", { name: "Record a settlement" }).click();
    await form(page, record).getByLabel("From").selectOption({ label: "Cai" });
    await form(page, record).getByLabel("To").selectOption({ label: "Ana" });
    await form(page, record).getByLabel("Date").fill("2026-11-14");
    await form(page, record).getByLabel("Currency").selectOption("USD");
    await form(page, record).getByLabel("Amount (USD)").fill("32.40");
    // $32.40 × 0.925926 = 30.0000024 EUR, which is €30.00.
    await expect(quietLine(page, record)).toHaveText(
      "= €30.00 · 1 USD = 0.925926 EUR · rate from Frankfurter"
    );
    await form(page, record)
      .getByRole("button", { name: "Record settlement" })
      .click();
    await expect(settlementRows(page).first()).toContainText(
      "Cai paid Ana €30.00 ($32.40)"
    );
  });

  await test.step("pick euros: the foreign amount and rate go", async () => {
    await settlementRows(page).getByRole("link", { name: /^Edit/ }).click();
    await expect(quietLine(page, edit)).toHaveText(
      "= €30.00 · 1 USD = 0.925926 EUR · saved rate"
    );
    await form(page, edit).getByLabel("Currency").selectOption("EUR");
    await form(page, edit).getByLabel("Amount (EUR)").fill("30.00");
    await expect(quietLine(page, edit)).toHaveCount(0);
    await expect(form(page, edit).getByLabel(/^Exchange rate/)).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "6-back-to-group-currency");
    await form(page, edit)
      .getByRole("button", { name: "Save changes" })
      .click();
  });

  await test.step("the row is a plain amount", async () => {
    await expect(settlementRows(page).first()).toContainText(
      "Cai paid Ana €30.00"
    );
    await expect(settlementRows(page).first()).not.toContainText("$");
    await expect(balances(page)).toHaveText([
      "Ana owes €30.00",
      "Ben settled up",
      "Cai is owed €30.00",
    ]);
    await screenshot(page, testInfo, "7-plain-amount-row");
  });

  expect(errors).toEqual([]);
});

test("change who paid a settlement worked backwards, and its yen stay", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Tokyo trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Cai"],
  });
  await sayWhoYouAre(page, "Ana");
  const record = "Record a settlement";
  const edit = "Edit the settlement";

  await test.step("Ana pays ¥3006 for all three", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Ramen");
    await page.getByLabel("Amount (JPY)").fill("3006");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥2,004",
      "Ben owes ¥1,002",
      "Cai owes ¥1,002",
    ]);
  });

  await test.step("Ben's suggested ¥1002 is worked backwards into dollars", async () => {
    await page
      .getByRole("list", { name: "Suggested settlements" })
      .getByRole("listitem")
      .filter({ hasText: "Ben pays Ana" })
      .getByRole("link", { name: "Record this settlement" })
      .click();
    await form(page, record).getByLabel("Currency").selectOption("USD");
    await form(page, record)
      .getByRole("button", {
        name: /^(Type the rate instead|Use another rate or my bank's amount)$/,
      })
      .click();
    await form(page, record)
      .getByLabel("Exchange rate (1 USD = ? JPY)")
      .fill("150.37");
    // ¥1002 ÷ 150.37 = 6.6635… USD, proposed as $6.66; the suggested ¥1002
    // stays, though $6.66 × 150.37 = 1001.46… converts forward to ¥1001.
    await expect(form(page, record).getByLabel("Amount (USD)")).toHaveValue(
      "6.66"
    );
    await form(page, record)
      .getByRole("button", { name: "Record settlement" })
      .click();
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥1,002",
      "Ben settled up",
      "Cai owes ¥1,002",
    ]);
  });

  await test.step("say Cai paid it instead: the ¥1002 moves with it", async () => {
    await settlementRows(page).getByRole("link", { name: /^Edit/ }).click();
    await expect(form(page, edit).getByText(/^= ¥/)).toHaveText(
      "= ¥1,002 · 1 USD = 150.37 JPY · saved rate"
    );
    await form(page, edit).getByLabel("From").selectOption({ label: "Cai" });
    await form(page, edit)
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(settlementRows(page).first()).toContainText(
      /Cai paid Ana ¥1,002 \(\$6\.66\)/
    );
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥1,002",
      "Ben owes ¥1,002",
      "Cai settled up",
    ]);
  });

  expect(errors).toEqual([]);
});

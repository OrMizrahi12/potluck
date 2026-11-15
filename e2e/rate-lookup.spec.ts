import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// The dev server asks the fake rate source (src/group/fake-frankfurter.ts),
// whose answers depend on the foreign currency's code: CHF 1.0463 on the
// asked date, SEK 0.0874 from two days earlier, NOK 0.0851 after 2 seconds,
// THB after 6 seconds, HUF down, BOV not covered.

// Amounts and dates are formatted for the visitor's locale; pin it.
test.use({ locale: "en-US" });

function form(page: Page) {
  return page.getByRole("form", { name: "Add an expense" });
}

function quietLine(page: Page) {
  return form(page).getByText(/^= €/);
}

async function startExpense(page: Page, testInfo: TestInfo, groupName: string) {
  await createGroup(page, {
    name: `${groupName} (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");
  await page.getByRole("link", { name: "Add an expense" }).click();
  await form(page).getByLabel("Description").fill("Fondue");
}

/**
 * A past date no earlier run has looked up, so the lookup's answer isn't
 * already kept by the server and arrives as late as the fake makes it.
 */
function dateNoRunHasAsked(testInfo: TestInfo): string {
  const day = new Date(Date.UTC(1990, 0, 1));
  const seconds = Math.floor(Date.now() / 1000);
  day.setUTCDate(
    day.getUTCDate() + (seconds % 5000) * 2 + testInfo.parallelIndex
  );
  return day.toISOString().slice(0, 10);
}

test("a rate found on the expense's date is proposed, then saved", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "Zermatt trip");

  await test.step("pick francs: Frankfurter's rate is proposed", async () => {
    await form(page).getByLabel("Date").fill("2026-11-10");
    await form(page).getByLabel("Currency").selectOption("CHF");
    await form(page).getByLabel("Amount (CHF)").fill("48");
    // CHF 48.00 × 1.0463 = 50.2224 EUR, which is €50.22.
    await expect(quietLine(page)).toHaveText(
      "= €50.22 · 1 CHF = 1.0463 EUR · rate from Frankfurter"
    );
    // The rate and bank amount fields stay folded away.
    await expect(form(page).getByLabel(/Exchange rate/)).toBeHidden();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-rate-found");
  });

  await test.step("type another rate, then go back to Frankfurter's", async () => {
    await form(page)
      .getByRole("button", { name: "Use another rate or my bank's amount" })
      .click();
    await expect(
      form(page).getByLabel("Exchange rate (1 CHF = ? EUR)")
    ).toHaveValue("1.0463");
    await form(page).getByLabel("Exchange rate (1 CHF = ? EUR)").fill("1.05");
    // CHF 48.00 × 1.05 = €50.40.
    await expect(quietLine(page)).toHaveText(
      "= €50.40 · 1 CHF = 1.05 EUR · typed"
    );
    await form(page)
      .getByRole("button", { name: "Use Frankfurter's rate" })
      .click();
    await expect(quietLine(page)).toHaveText(
      "= €50.22 · 1 CHF = 1.0463 EUR · rate from Frankfurter"
    );
    await expect(form(page).getByLabel(/Exchange rate/)).toBeHidden();
  });

  await test.step("save: the list row shows the rate", async () => {
    await form(page).getByRole("button", { name: "Add expense" }).click();
    const row = page.getByRole("listitem", { name: "Fondue" });
    await expect(row.locator(".expense-head")).toHaveText("Fondue€50.22");
    await expect(row.locator("p.muted")).toContainText(
      /^Paid CHF\s48\.00 at 1 CHF = 1\.0463 EUR · Paid by Ana · /
    );
    await screenshot(page, testInfo, "2-rate-found-row");
  });

  expect(errors).toEqual([]);
});

test("a rate from an earlier day says which day", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "Stockholm trip");

  await form(page).getByLabel("Date").fill("2026-11-08");
  await form(page).getByLabel("Currency").selectOption("SEK");
  await form(page).getByLabel("Amount (SEK)").fill("100");
  // SEK 100.00 × 0.0874 = €8.74, at the rate of 6 Nov for an expense of 8 Nov.
  await expect(quietLine(page)).toHaveText(
    "= €8.74 · 1 SEK = 0.0874 EUR · rate from Frankfurter · rate of Nov 6, 2026"
  );
  await expectNoSidewaysScroll(page);
  await screenshot(page, testInfo, "3-earlier-day");

  expect(errors).toEqual([]);
});

test("a lookup with no answer within 4 seconds asks for a rate", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "Bangkok trip");

  await test.step("while looking up", async () => {
    await form(page).getByLabel("Currency").selectOption("THB");
    await form(page).getByLabel("Amount (THB)").fill("1000");
    await expect(
      form(page).getByText("Looking up the THB rate… You can type it instead.")
    ).toBeVisible();
    await expect(
      form(page).getByRole("button", { name: "Type the rate instead" })
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "4-looking-up");
  });

  await test.step("after 4 seconds", async () => {
    await expect(
      form(page).getByText("Couldn't get a rate right now.")
    ).toBeVisible({ timeout: 10_000 });
    await expect(form(page).getByText("Looking up the THB rate…")).toBeHidden();
    // The rate and bank amount fields open on their own.
    await expect(
      form(page).getByLabel("Exchange rate (1 THB = ? EUR)")
    ).toBeVisible();
    await expect(
      form(page).getByLabel("Or what your bank charged (EUR)")
    ).toBeVisible();
    await screenshot(page, testInfo, "5-timed-out");
  });

  expect(errors).toEqual([]);
});

test("a source that's down offers Try again", async ({ page }, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "Budapest trip");
  let lookups = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/rate"))
      lookups++;
  });

  await form(page).getByLabel("Currency").selectOption("HUF");
  await form(page).getByLabel("Amount (HUF)").fill("12000");
  await expect(
    form(page).getByText("Couldn't get a rate right now.")
  ).toBeVisible();
  await expect(
    form(page).getByText("Or type the rate, or what your bank charged in EUR.")
  ).toBeVisible();
  await expect(
    form(page).getByLabel("Exchange rate (1 HUF = ? EUR)")
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  await screenshot(page, testInfo, "6-temporary-failure");

  await form(page).getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => lookups).toBe(2);
  await expect(
    form(page).getByText("Couldn't get a rate right now.")
  ).toBeVisible();

  expect(errors).toEqual([]);
});

test("a currency with no rate asks for one, and a typed rate is saved", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "La Paz trip");

  await test.step("no rate available, no retry", async () => {
    await form(page).getByLabel("Date").fill("2026-11-10");
    await form(page).getByLabel("Currency").selectOption("BOV");
    await form(page).getByLabel("Amount (BOV)").fill("100");
    await expect(
      form(page).getByText(
        "No rate available for BOV on this date. Type the rate, or what your bank charged in EUR."
      )
    ).toBeVisible();
    await expect(
      form(page).getByRole("button", { name: "Try again" })
    ).toHaveCount(0);
  });

  await test.step("type the rate and save", async () => {
    await form(page).getByLabel("Exchange rate (1 BOV = ? EUR)").fill("0.13");
    // BOV 100.00 × 0.13 = €13.00.
    await expect(quietLine(page)).toHaveText(
      "= €13.00 · 1 BOV = 0.13 EUR · typed"
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "7-unavailable-typed");
    await form(page).getByRole("button", { name: "Add expense" }).click();
    const row = page.getByRole("listitem", { name: "Fondue" });
    await expect(row.locator(".expense-head")).toHaveText("Fondue€13.00");
    await expect(
      page.getByRole("list", { name: "Balances" }).getByRole("listitem")
    ).toHaveText(["Ana is owed €6.50", "Ben owes €6.50"]);
  });

  expect(errors).toEqual([]);
});

test("a rate typed during the lookup wins over the late answer", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await startExpense(page, testInfo, "Oslo trip");

  await form(page).getByLabel("Date").fill(dateNoRunHasAsked(testInfo));
  await form(page).getByLabel("Currency").selectOption("NOK");
  await form(page).getByLabel("Amount (NOK)").fill("500");
  await form(page)
    .getByRole("button", { name: "Type the rate instead" })
    .click();
  await form(page).getByLabel("Exchange rate (1 NOK = ? EUR)").fill("0.09");

  // The fake answers 0.0851 after 2 seconds; the typed rate stays.
  await expect(form(page).getByText("Looking up the NOK rate…")).toBeHidden({
    timeout: 10_000,
  });
  await expect(
    form(page).getByRole("button", { name: "Use Frankfurter's rate" })
  ).toBeVisible();
  await expect(
    form(page).getByLabel("Exchange rate (1 NOK = ? EUR)")
  ).toHaveValue("0.09");
  // NOK 500.00 × 0.09 = €45.00.
  await expect(quietLine(page)).toHaveText(
    "= €45.00 · 1 NOK = 0.09 EUR · typed"
  );
  await expectNoSidewaysScroll(page);
  await screenshot(page, testInfo, "8-typed-wins");

  expect(errors).toEqual([]);
});

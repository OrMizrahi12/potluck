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

function suggestions(page: Page) {
  return page
    .getByRole("list", { name: "Suggested settlements" })
    .getByRole("listitem");
}

/** Taps "Record this settlement" on the suggestion that reads `text`. */
async function recordSuggestion(page: Page, text: string) {
  await suggestions(page)
    .filter({ hasText: text })
    .getByRole("link", { name: "Record this settlement" })
    .click();
}

test("record the suggested settlements and reach settled up", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Kyoto trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await sayWhoYouAre(page, "Ana");
  await expect(page.getByText("Everyone is settled up.")).toBeVisible();

  await test.step("an expense brings suggested settlements", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Dinner");
    await page.getByLabel("Amount (JPY)").fill("900");
    await page.getByLabel("Paid by").selectOption({ label: "Ana" });
    await page.getByRole("button", { name: "Add expense" }).click();

    // ¥900 among three: Ana is owed ¥600, Ben and Chloé owe ¥300 each.
    await expect(suggestions(page)).toHaveText([
      /^Ben pays Ana ¥300/,
      /^Chloé pays Ana ¥300/,
    ]);
    await expect(page.getByText("Everyone is settled up.")).toBeHidden();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-suggested-settlements");
  });

  await test.step("a suggestion pre-fills the settlement form, and its amount can be changed", async () => {
    await recordSuggestion(page, "Ben pays Ana");
    const form = page.getByRole("form", { name: "Record a settlement" });
    await expect(form.getByLabel("From").locator("option:checked")).toHaveText(
      "Ben"
    );
    await expect(form.getByLabel("To").locator("option:checked")).toHaveText(
      "Ana"
    );
    await expect(form.getByLabel("Amount (JPY)")).toHaveValue("300");
    await expect(form.getByLabel("Date")).not.toHaveValue("");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-pre-filled-settlement");

    // A partial settlement: Ben pays ¥100 now.
    await form.getByLabel("Amount (JPY)").fill("100");
    await form.getByRole("button", { name: "Record settlement" }).click();

    await expect(balances(page)).toHaveText([
      "Ana is owed ¥500",
      "Ben owes ¥200",
      "Chloé owes ¥300",
    ]);
    await expect(suggestions(page)).toHaveText([
      /^Chloé pays Ana ¥300/,
      /^Ben pays Ana ¥200/,
    ]);
    await expect(
      page
        .getByRole("list", { name: "Settlements", exact: true })
        .getByRole("listitem")
    ).toHaveText([/^Ben paid Ana ¥100/]);
  });

  await test.step("a settlement from a member to themselves is refused", async () => {
    await page.getByRole("link", { name: "Record a settlement" }).click();
    const form = page.getByRole("form", { name: "Record a settlement" });
    await form.getByLabel("From").selectOption({ label: "Ana" });
    await form.getByLabel("To").selectOption({ label: "Ana" });
    await form.getByLabel("Amount (JPY)").fill("100");
    await form.getByRole("button", { name: "Record settlement" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "Choose two different members."
    );
    await page.getByRole("link", { name: /^←/ }).click();
  });

  await test.step("record the rest and reach settled up", async () => {
    await recordSuggestion(page, "Chloé pays Ana");
    await page.getByRole("button", { name: "Record settlement" }).click();
    await expect(suggestions(page)).toHaveText([/^Ben pays Ana ¥200/]);
    await recordSuggestion(page, "Ben pays Ana");
    await page.getByRole("button", { name: "Record settlement" }).click();

    await expect(balances(page)).toHaveText([
      "Ana settled up",
      "Ben settled up",
      "Chloé settled up",
    ]);
    await expect(suggestions(page)).toHaveCount(0);
    await expect(page.getByText("Everyone is settled up.")).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-settled-up");
  });

  expect(errors, "browser errors").toEqual([]);
});

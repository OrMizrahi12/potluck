import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  screenshot,
  watchForErrors,
} from "./helpers";

// Amounts are formatted for the visitor's locale; pin it so the text is known.
test.use({ locale: "en-US" });

function balances(page: Page) {
  return page.getByRole("list", { name: "Balances" }).getByRole("listitem");
}

function settlements(page: Page) {
  return page
    .getByRole("list", { name: "Settlements", exact: true })
    .getByRole("listitem");
}

/** Adds a ¥ expense split among everyone, from the group page. */
async function addExpense(
  page: Page,
  {
    description,
    amount,
    payer,
  }: { description: string; amount: string; payer: string }
) {
  await page.getByRole("link", { name: "Add an expense" }).click();
  // Pages visited earlier stay in the document, hidden: scope to the visible form.
  const form = page.getByRole("form", { name: "Add an expense" });
  await form.getByLabel("Description").fill(description);
  await form.getByLabel("Amount (JPY)").fill(amount);
  await form.getByLabel("Paid by").selectOption({ label: payer });
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22}$/);
}

test("edit and delete an expense", async ({ page }, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Kyoto trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await addExpense(page, {
    description: "Dinner",
    amount: "900",
    payer: "Ana",
  });
  await addExpense(page, { description: "Taxi", amount: "300", payer: "Ben" });
  // Dinner: Ana +600, Ben −300, Chloé −300. Taxi: Ben +200, Ana and Chloé −100.
  await expect(balances(page)).toHaveText([
    "Ana is owed ¥500",
    "Ben owes ¥100",
    "Chloé owes ¥400",
  ]);

  await test.step("edit every field of an expense, and the balances follow", async () => {
    await page.getByRole("link", { name: "Edit Dinner" }).click();
    const form = page.getByRole("form", { name: "Edit the expense" });
    await expect(form.getByLabel("Description")).toHaveValue("Dinner");
    await expect(form.getByLabel("Amount (JPY)")).toHaveValue("900");
    await expect(form.getByLabel("Date")).not.toHaveValue("");
    await expect(
      form.getByLabel("Paid by").locator("option:checked")
    ).toHaveText("Ana");
    await expect(form.getByRole("checkbox", { name: "Ben" })).toBeChecked();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-edit-expense");

    await form.getByLabel("Description").fill("Late dinner");
    await form.getByLabel("Amount (JPY)").fill("600");
    await form.getByLabel("Date").fill("2026-11-01");
    await form.getByLabel("Paid by").selectOption({ label: "Chloé" });
    await form.getByRole("checkbox", { name: "Ben" }).uncheck();
    await form.getByRole("button", { name: "Save changes" }).click();

    // Late dinner, ¥600 by Chloé for Ana and Chloé: Chloé +300, Ana −300.
    // With the taxi: Ana −400, Ben +200, Chloé +200.
    const dinner = page.getByRole("listitem", { name: "Late dinner" });
    await expect(dinner).toContainText("¥600");
    await expect(dinner).toContainText("Paid by Chloé · Nov 1, 2026");
    await expect(
      dinner.getByRole("list", { name: "Shares" }).getByRole("listitem")
    ).toHaveText(["Ana ¥300", "Chloé ¥300"]);
    await expect(balances(page)).toHaveText([
      "Ana owes ¥400",
      "Ben is owed ¥200",
      "Chloé is owed ¥200",
    ]);
    await screenshot(page, testInfo, "2-edited-expense");
  });

  await test.step("delete an expense after one confirmation", async () => {
    await page.getByRole("link", { name: "Edit Taxi" }).click();
    const remove = page.getByRole("form", { name: "Delete the expense" });
    await remove.getByRole("button", { name: "Delete expense" }).click();
    await expect(remove).toContainText("This can't be undone.");
    await remove.getByRole("button", { name: "Keep it" }).click();
    await remove.getByRole("button", { name: "Delete expense" }).click();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-confirm-delete");
    await remove
      .getByRole("button", { name: "Yes, delete the expense" })
      .click();

    await expect(page.getByRole("listitem", { name: "Taxi" })).toHaveCount(0);
    // Only the late dinner is left: Ana −300, Chloé +300.
    await expect(balances(page)).toHaveText([
      "Ana owes ¥300",
      "Ben settled up",
      "Chloé is owed ¥300",
    ]);
  });

  expect(errors, "browser errors").toEqual([]);
});

test("edit and delete a settlement", async ({ page }, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Kyoto trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await addExpense(page, {
    description: "Dinner",
    amount: "900",
    payer: "Ana",
  });
  await page.getByRole("link", { name: "Record a settlement" }).click();
  const record = page.getByRole("form", { name: "Record a settlement" });
  await record.getByLabel("From").selectOption({ label: "Ben" });
  await record.getByLabel("To").selectOption({ label: "Ana" });
  await record.getByLabel("Amount (JPY)").fill("300");
  await record.getByRole("button", { name: "Record settlement" }).click();
  await expect(settlements(page)).toHaveText([/^Ben paid Ana ¥300/]);

  await test.step("edit a settlement", async () => {
    await settlements(page).getByRole("link", { name: /^Edit/ }).click();
    const form = page.getByRole("form", { name: "Edit the settlement" });
    await expect(form.getByLabel("Amount (JPY)")).toHaveValue("300");
    await form.getByLabel("From").selectOption({ label: "Chloé" });
    await form.getByLabel("Amount (JPY)").fill("200");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(settlements(page)).toHaveText([/^Chloé paid Ana ¥200/]);
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥400",
      "Ben owes ¥300",
      "Chloé owes ¥100",
    ]);
  });

  await test.step("delete a settlement", async () => {
    await settlements(page).getByRole("link", { name: /^Edit/ }).click();
    const remove = page.getByRole("form", { name: "Delete the settlement" });
    await remove.getByRole("button", { name: "Delete settlement" }).click();
    await remove
      .getByRole("button", { name: "Yes, delete the settlement" })
      .click();

    await expect(page.getByText("No settlements yet.")).toBeVisible();
    await expect(balances(page)).toHaveText([
      "Ana is owed ¥600",
      "Ben owes ¥300",
      "Chloé owes ¥300",
    ]);
  });

  expect(errors, "browser errors").toEqual([]);
});

test("a save from a version someone else changed says it changed and keeps their change", async ({
  page: ben,
  context,
}, testInfo) => {
  const chloe = await context.newPage();
  const benErrors = watchForErrors(ben);
  const chloeErrors = watchForErrors(chloe);
  await createGroup(ben, {
    name: `Kyoto trip (${testInfo.project.name} ${Date.now()})`,
    currency: "JPY",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  await addExpense(ben, { description: "Dinner", amount: "900", payer: "Ana" });
  await ben.getByRole("link", { name: "Edit Dinner" }).click();
  await expect(ben).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  // Chloé opens the same expense on her phone before Ben saves.
  await chloe.goto(ben.url());
  await expect(
    chloe
      .getByRole("form", { name: "Edit the expense" })
      .getByLabel("Amount (JPY)")
  ).toHaveValue("900");

  const benForm = ben.getByRole("form", { name: "Edit the expense" });
  await benForm.getByLabel("Amount (JPY)").fill("1200");
  await benForm.getByRole("button", { name: "Save changes" }).click();
  await expect(ben.getByRole("listitem", { name: "Dinner" })).toContainText(
    "¥1,200"
  );

  await test.step("an edit is refused", async () => {
    const form = chloe.getByRole("form", { name: "Edit the expense" });
    await form.getByLabel("Description").fill("Dinner and drinks");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "This changed since you opened the page. Reload to see the latest, then try again. Reload"
    );
    await screenshot(chloe, testInfo, "4-this-changed-reload");
  });

  await test.step("a delete is refused", async () => {
    const remove = chloe.getByRole("form", { name: "Delete the expense" });
    await remove.getByRole("button", { name: "Delete expense" }).click();
    await remove
      .getByRole("button", { name: "Yes, delete the expense" })
      .click();
    await expect(remove.getByRole("alert")).toHaveText(
      "This changed since you opened the page. Reload to see the latest, then try again. Reload"
    );
  });

  await test.step("reloading shows the other member's change", async () => {
    await chloe
      .getByRole("form", { name: "Edit the expense" })
      .getByRole("link", { name: "Reload" })
      .click();
    const form = chloe.getByRole("form", { name: "Edit the expense" });
    await expect(form.getByLabel("Amount (JPY)")).toHaveValue("1200");
    await expect(form.getByLabel("Description")).toHaveValue("Dinner");
    await expect(form.getByRole("alert")).toBeHidden();
  });

  expect([...benErrors, ...chloeErrors], "browser errors").toEqual([]);
});

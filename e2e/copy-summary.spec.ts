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

function summaryRegion(page: Page) {
  return page.getByRole("region", { name: "Group summary" });
}

test("copy the group summary to paste into the group chat", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  const groupName = `Porto trip (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name: groupName,
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Cy"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("a group with no expenses has nothing to copy", async () => {
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy summary" })
    ).toHaveCount(0);
  });

  await test.step("after the first expense, copy the summary", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await page.getByLabel("Description").fill("Dinner");
    await page.getByLabel("Amount (EUR)").fill("30.00");
    await page.getByLabel("Paid by").selectOption({ label: "Ana" });
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();

    const copy = summaryRegion(page).getByRole("button", {
      name: "Copy summary",
    });
    await copy.focus();
    await page.keyboard.press("Enter");
    await expect(summaryRegion(page).getByRole("status")).toHaveText(
      "Summary copied."
    );
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-summary-copied");

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // €30.00 split equally three ways is €10.00 each: Ana paid it all, so
    // she is owed €20.00 and Ben and Cy each owe her €10.00.
    expect(copied).toBe(
      [
        groupName,
        "Group spending: €30.00",
        "",
        "Balances",
        "Ana is owed €20.00",
        "Ben owes €10.00",
        "Cy owes €10.00",
        "",
        "Suggested settlements",
        "Ben pays Ana €10.00",
        "Cy pays Ana €10.00",
      ].join("\n")
    );
    expect(copied).not.toContain("http");
    expect(copied).not.toContain(new URL(page.url()).pathname.split("/")[2]);

    // The copied amounts are the ones the page shows.
    await expect(page.getByText(/^Group spending: /)).toHaveText(
      "Group spending: €30.00"
    );
    const balances = await page
      .getByRole("list", { name: "Balances" })
      .getByRole("listitem")
      .allTextContents();
    const settlements = await page
      .getByRole("list", { name: "Suggested settlements" })
      .getByRole("listitem")
      .locator("> span")
      .allTextContents();
    expect([...balances, ...settlements]).toEqual([
      "Ana is owed €20.00",
      "Ben owes €10.00",
      "Cy owes €10.00",
      "Ben pays Ana €10.00",
      "Cy pays Ana €10.00",
    ]);
  });

  expect(errors, "browser errors").toEqual([]);
});

test("with the clipboard blocked, the summary is selected to copy by hand", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Blocked", "NotAllowedError"));
  });
  const groupName = `Lisbon trip (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name: groupName,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");
  await page.getByRole("link", { name: "Add an expense" }).click();
  await page.getByLabel("Description").fill("Taxi");
  await page.getByLabel("Amount (EUR)").fill("12.00");
  await page.getByLabel("Paid by").selectOption({ label: "Ben" });
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();

  await summaryRegion(page)
    .getByRole("button", { name: "Copy summary" })
    .click();
  await expect(summaryRegion(page).getByRole("status")).toHaveText(
    "Couldn't copy automatically. The summary is selected: copy it from there."
  );
  const textarea = summaryRegion(page).getByRole("textbox", {
    name: "Summary to copy",
  });
  // €12.00 split equally two ways is €6.00 each: Ben paid, so Ana owes him €6.00.
  const expected = [
    groupName,
    "Group spending: €12.00",
    "",
    "Balances",
    "Ana owes €6.00",
    "Ben is owed €6.00",
    "",
    "Suggested settlements",
    "Ana pays Ben €6.00",
  ].join("\n");
  await expect(textarea).toHaveValue(expected);
  await expect(textarea).toHaveAttribute("readonly", "");
  const selected = await textarea.evaluate((el: HTMLTextAreaElement) =>
    el.value.slice(el.selectionStart, el.selectionEnd)
  );
  expect(selected).toBe(expected);
  await expectNoSidewaysScroll(page);
  await screenshot(page, testInfo, "2-summary-selected");

  expect(errors, "browser errors").toEqual([]);
});

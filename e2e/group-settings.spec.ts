import { expect, test, type Page } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// Chromium logs this for any page answered with a 404. Opening the deleted
// group's link is meant to get one, so it isn't an error.
const CHROMIUM_404_CONSOLE_ERROR =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";

test.use({ locale: "en-US" });

/** The settings page's entry for one member. */
function member(page: Page, name: string) {
  return page
    .getByRole("list", { name: "Members" })
    .getByRole("listitem", { name, exact: true });
}

test("manage members and currency, make a member inactive, then delete the group", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  const name = `Berlin flat (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name,
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  const groupLink = page.url();
  await sayWhoYouAre(page, "Ana");

  await test.step("change the currency while the group is empty", async () => {
    await page.getByRole("link", { name: "Group settings" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Group settings" })
    ).toBeVisible();
    const currency = page.getByRole("form", { name: "Change currency" });
    await currency.getByLabel("Currency").selectOption("JPY");
    await currency.getByRole("button", { name: "Change currency" }).click();
    await expect(page.getByText("The currency is JPY")).toBeVisible();
  });

  await test.step("add, rename and delete a member", async () => {
    await page.getByLabel("New member").fill("Dan");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(member(page, "Dan")).toBeVisible();
    await expect(page.getByLabel("New member")).toHaveValue("");

    await page.getByLabel("New member").fill(" ana ");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(
      page.getByRole("form", { name: "Add a member" }).getByRole("alert")
    ).toHaveText("Another member already has that name.");

    await member(page, "Dan").getByLabel("Name").fill("Dave");
    await member(page, "Dan").getByRole("button", { name: "Rename" }).click();
    await expect(member(page, "Dave")).toBeVisible();

    await member(page, "Dave").getByRole("button", { name: "Delete" }).click();
    await member(page, "Dave")
      .getByRole("alertdialog", { name: "Delete Dave?" })
      .getByRole("button", { name: "Delete for good" })
      .click();
    await expect(member(page, "Dave")).toHaveCount(0);
  });

  await test.step("make a member inactive", async () => {
    await member(page, "Ben")
      .getByRole("button", { name: "Make inactive" })
      .click();
    await expect(member(page, "Ben")).toContainText("Inactive");
    await expect(
      member(page, "Ben").getByRole("button", { name: "Make active" })
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-member-inactive");
  });

  await test.step("an inactive member isn't pre-selected, but can be picked", async () => {
    await page.getByRole("link", { name: `← ${name}` }).click();
    await page.getByRole("link", { name: "Add an expense" }).click();
    const participants = page.getByRole("group", {
      name: "Split equally among",
    });
    await expect(participants.getByLabel("Ana")).toBeChecked();
    await expect(participants.getByLabel("Ben")).not.toBeChecked();
    await expect(participants.getByLabel("Chloé")).toBeChecked();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-inactive-not-pre-selected");

    // A late receipt: Ben paid ¥900 for himself and Ana.
    await page.getByLabel("Description").fill("Late receipt");
    await page.getByLabel("Amount (JPY)").fill("900");
    await page.getByLabel("Paid by").selectOption({ label: "Ben" });
    await participants.getByLabel("Ben").check();
    await participants.getByLabel("Chloé").uncheck();
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(
      page.getByRole("list", { name: "Balances" }).getByRole("listitem")
    ).toHaveText(["Ana owes ¥450", "Ben is owed ¥450", "Chloé settled up"]);
  });

  await test.step("a referenced member can only be made active or inactive, and the currency is fixed", async () => {
    await page.getByRole("link", { name: "Group settings" }).click();
    await expect(
      member(page, "Ben").getByRole("button", { name: "Delete" })
    ).toHaveCount(0);
    await expect(member(page, "Ben")).toContainText("can't be deleted");
    await expect(
      member(page, "Chloé").getByRole("button", { name: "Delete" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Change currency" })
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "It can't be changed once the group has an expense or a settlement"
      )
    ).toBeVisible();
  });

  await test.step("delete the group", async () => {
    await page.getByRole("button", { name: "Delete this group" }).click();
    const confirmation = page.getByRole("alertdialog", {
      name: "Delete this group?",
    });
    await expect(confirmation).toContainText("This can't be undone.");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-delete-confirmation");
    await confirmation.getByRole("button", { name: "Delete for good" }).click();

    await expect(page).toHaveURL(/\/$/);
    // This device forgets the group: it's no longer in my groups.
    await expect(page.getByLabel("Group name")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("potluck.device"))
    ).not.toContain(new URL(groupLink).pathname.slice(3));
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });

  await test.step("the group's link stops working", async () => {
    const response = await page.goto(groupLink);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "No group at this link"
    );
    await page.waitForLoadState("networkidle");
  });

  expect(
    errors.filter((e) => e !== CHROMIUM_404_CONSOLE_ERROR),
    "browser errors"
  ).toEqual([]);
});

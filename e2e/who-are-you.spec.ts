import { expect, test } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  screenshot,
  watchForErrors,
} from "./helpers";

test.use({ locale: "en-US" });

test("open a group, say who you are, find yourself as payer and return from my groups", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  const name = `Lisbon flat (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name,
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Chloé"],
  });
  const groupLink = page.url();

  await test.step("the group asks who you are the first time", async () => {
    const prompt = page.getByRole("region", { name: "Who are you?" });
    await expect(prompt).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-who-are-you");
    await prompt.getByRole("button", { name: "Ben" }).click();
    await expect(prompt).toBeHidden();
  });

  await test.step("the expense form has you as the payer", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await expect(page.getByLabel("Paid by")).toHaveValue(/.+/);
    await expect(
      page.getByLabel("Paid by").locator("option:checked")
    ).toHaveText("Ben");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-payer-filled-in");
  });

  await test.step("the home page lists the group and leads back to it", async () => {
    await page.goto("/");
    const myGroups = page.getByRole("list", { name: "My groups" });
    await expect(myGroups.getByRole("link", { name })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "3-my-groups");
    await myGroups.getByRole("link", { name }).click();
    await expect(page).toHaveURL(groupLink);
    // Already answered on this device: the group doesn't ask again.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(
      page.getByRole("region", { name: "Who are you?" })
    ).toBeHidden();
  });

  expect(errors, "browser errors").toEqual([]);
});

test("skip the question to look around, but answer it before adding an expense", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Look around (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  const prompt = page.getByRole("region", { name: "Who are you?" });

  await test.step("skip and still see the group", async () => {
    await prompt.getByRole("button", { name: "Skip" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByRole("list", { name: "Balances" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("list", { name: "Balances" })).toBeVisible();
    await expect(prompt).toBeHidden();
  });

  await test.step("adding an expense asks first", async () => {
    await page.getByRole("link", { name: "Add an expense" }).click();
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole("button", { name: "Skip" })).toHaveCount(0);
    await expect(
      page.getByRole("form", { name: "Add an expense" })
    ).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "4-asked-before-adding");

    await prompt.getByRole("button", { name: "Ana" }).click();
    await expect(
      page.getByLabel("Paid by").locator("option:checked")
    ).toHaveText("Ana");
  });

  expect(errors, "browser errors").toEqual([]);
});

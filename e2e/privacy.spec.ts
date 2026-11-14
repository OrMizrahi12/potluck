import { expect, test, type Page } from "@playwright/test";

/** Creates a group through the home page's form and returns its link. */
async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByLabel("Member 1", { exact: true }).fill("Ana");
  await page.getByLabel("Member 2", { exact: true }).fill("Ben");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22,}$/);
  return page.url();
}

test("every page links to the privacy page", async ({ page }) => {
  const groupLink = await createGroup(page, `Privacy link ${Date.now()}`);

  for (const path of [
    "/",
    new URL(groupLink).pathname,
    "/g/" + "A".repeat(22), // a link no group has
    "/privacy",
  ]) {
    await page.goto(path);
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page, `from ${path}`).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  }
});

test("the privacy page says what's stored and that the link is the key", async ({
  page,
}) => {
  await page.goto("/privacy");

  const main = page.getByRole("main");
  await expect(main).toContainText("What Potluck stores");
  await expect(main).toContainText(
    "Anyone with a group's link has full control of the group"
  );
  await expect(main).toContainText("including deleting it");
  await expect(main).toContainText("The link can't be changed");
  await expect(main).toContainText("A group is kept until someone deletes it");
});

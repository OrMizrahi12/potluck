import { expect, test, type Page } from "@playwright/test";

/** Creates a group through the home page's form and returns its link. */
async function createGroup(
  page: Page,
  group: { name: string; currency: string; memberNames: [string, string] }
): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Group name").fill(group.name);
  await page.getByLabel("Currency").selectOption(group.currency);
  await page.getByLabel("Member 1", { exact: true }).fill(group.memberNames[0]);
  await page.getByLabel("Member 2", { exact: true }).fill(group.memberNames[1]);
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22,}$/);
  return page.url();
}

test("every page links to the privacy page", async ({ page }) => {
  const groupLink = await createGroup(page, {
    name: `Privacy link ${Date.now()}`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });

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

test("a visit asks nothing of other sites and sets no cookies", async ({
  page,
  context,
  baseURL,
}) => {
  const appHost = new URL(baseURL!).host;
  const elsewhere: string[] = [];
  // On the context, so requests from any page or worker it opens count too.
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.host !== appHost)
      elsewhere.push(request.url());
  });

  const groupLink = await createGroup(page, {
    name: `No trackers ${Date.now()}`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await page.goto(groupLink);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");

  expect(elsewhere, "requests to other hosts").toEqual([]);
  expect(await context.cookies(), "cookies").toEqual([]);
});

test("a group page asks search engines not to list it", async ({ page }) => {
  const groupLink = await createGroup(page, {
    name: `Noindex ${Date.now()}`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });

  await page.goto(groupLink);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /\bnoindex\b/
  );
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

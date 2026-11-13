import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** Saves a full-page screenshot to the test's output folder and attaches it to the report. */
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Collects console errors and uncaught exceptions (e.g. hydration mismatches), which the server's log never sees. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The page fits the viewport's width: nothing scrolls sideways. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow, "page wider than the viewport").toBe(0);
}

test("create a group, copy its link, open it and see the members", async ({
  page,
  browser,
}, testInfo) => {
  const groupName = `Lisbon trip (${testInfo.project.name} ${Date.now()})`;
  const memberNames = ["Ana", "Ben", "Chloé"];
  const organizerErrors = watchForErrors(page);

  await test.step("create the group from the home page", async () => {
    await page.goto("/");
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Currency").selectOption("EUR");
    await page.getByLabel("Member 1", { exact: true }).fill(memberNames[0]);
    await page.getByLabel("Member 2", { exact: true }).fill(memberNames[1]);
    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByLabel("Member 3", { exact: true }).fill(memberNames[2]);
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-create-form-filled");

    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22,}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(groupName);
  });

  const link = await test.step("copy the group's link", async () => {
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("status")).toHaveText("Link copied.");
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "2-group-page-link-copied");

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(page.url());
    return copied;
  });

  await test.step("open the link in a fresh browser and see the members", async () => {
    // Someone else's browser: same device, nothing shared with the organizer's.
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
      testInfo.project.use;
    const elsewhere = await browser.newContext({
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
    });
    const visitor = await elsewhere.newPage();
    const visitorErrors = watchForErrors(visitor);

    await visitor.goto(link);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(
      groupName
    );
    await expect(visitor.getByText("Currency: EUR · Euro")).toBeVisible();
    await expect(visitor.getByRole("listitem")).toHaveText(memberNames);
    await expectNoSidewaysScroll(visitor);
    await screenshot(visitor, testInfo, "3-link-opened-elsewhere");

    expect(visitorErrors, "browser errors on the opened link").toEqual([]);
    await elsewhere.close();
  });

  expect(organizerErrors, "browser errors while creating the group").toEqual(
    []
  );
});

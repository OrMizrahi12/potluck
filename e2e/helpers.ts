import { expect, type Page, type TestInfo } from "@playwright/test";

/** Saves a full-page screenshot to the test's output folder and attaches it to the report. */
export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Collects console errors and uncaught exceptions (e.g. hydration mismatches), which the server's log never sees. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The page fits the viewport's width: nothing scrolls sideways. */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow, "page wider than the viewport").toBe(0);
}

/** Creates a group from the home page and waits for its page to open. */
export async function createGroup(
  page: Page,
  {
    name,
    currency,
    memberNames,
  }: { name: string; currency: string; memberNames: string[] }
) {
  await page.goto("/");
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Currency").selectOption(currency);
  for (const [i, memberName] of memberNames.entries()) {
    if (i >= 2) await page.getByRole("button", { name: "Add member" }).click();
    await page.getByLabel(`Member ${i + 1}`, { exact: true }).fill(memberName);
  }
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{22,}$/);
}

/** Answers the group page's "Who are you?" as the named member. */
export async function sayWhoYouAre(page: Page, memberName: string) {
  const prompt = page.getByRole("region", { name: "Who are you?" });
  await prompt.getByRole("button", { name: memberName, exact: true }).click();
  await expect(prompt).toBeHidden();
}

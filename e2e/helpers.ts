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

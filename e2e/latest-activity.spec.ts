import { expect, test } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
  screenshot,
  watchForErrors,
} from "./helpers";

// Dates are formatted for the visitor's locale; pin it so the text is known.
test.use({ locale: "en-US" });

test("a group whose only activity is a settlement shows that settlement's date", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Ski weekend (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");

  await test.step("a new group shows no latest activity", async () => {
    await expect(page.getByText(/Latest activity/)).toBeHidden();
  });

  await test.step("record a settlement before any expense", async () => {
    await page.getByRole("link", { name: "Record a settlement" }).click();
    const record = page.getByRole("form", { name: "Record a settlement" });
    await record.getByLabel("From").selectOption({ label: "Ben" });
    await record.getByLabel("To").selectOption({ label: "Ana" });
    await record.getByLabel("Amount (EUR)").fill("10.00");
    await record.getByLabel("Date").fill("2026-11-15");
    await record.getByRole("button", { name: "Record settlement" }).click();
  });

  await test.step("the group page shows the settlement's date as its latest activity", async () => {
    await expect(page.getByText("Latest activity: Nov 15, 2026")).toBeVisible();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "1-latest-activity-from-settlement");
  });

  expect(errors).toEqual([]);
});

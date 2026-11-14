import { expect, test } from "@playwright/test";
import {
  createGroup,
  expectNoSidewaysScroll,
  sayWhoYouAre,
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

test("change who you are from the menu, separately in each group", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  const you = page.getByRole("region", { name: "You in this group" });

  await createGroup(page, {
    name: `Ski chalet (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  const chalet = page.url();
  await sayWhoYouAre(page, "Ana");
  await expect(you).toContainText("You are Ana.");

  await test.step("change to another member", async () => {
    await you.getByRole("button", { name: "Change" }).click();
    await expectNoSidewaysScroll(page);
    await screenshot(page, testInfo, "5-change-who-you-are");
    await you.getByRole("button", { name: "Ben" }).click();
    await expect(you).toContainText("You are Ben.");
    await page.reload();
    await expect(you).toContainText("You are Ben.");
  });

  await test.step("another group asks again and keeps its own answer", async () => {
    await createGroup(page, {
      name: `Book club (${testInfo.project.name} ${Date.now()})`,
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    await sayWhoYouAre(page, "Ana");
    await expect(you).toContainText("You are Ana.");

    await page.goto(chalet);
    await expect(you).toContainText("You are Ben.");
  });

  expect(errors, "browser errors").toEqual([]);
});

test("your own balance is called out as what you owe or are owed", async ({
  page,
}, testInfo) => {
  const errors = watchForErrors(page);
  const you = page.getByRole("region", { name: "You in this group" });
  await createGroup(page, {
    name: `Picnic (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ben");
  await expect(you).toContainText("You are settled up.");

  // Ben pays €10.00 split between Ana and Ben: €5.00 each, so Ben is owed €5.00.
  await page.getByRole("link", { name: "Add an expense" }).click();
  await page.getByLabel("Description").fill("Bread and cheese");
  await page.getByLabel("Amount (EUR)").fill("10");
  await page.getByRole("button", { name: "Add expense" }).click();

  await expect(you).toContainText("You are owed €5.00.");
  await expectNoSidewaysScroll(page);
  await screenshot(page, testInfo, "6-you-are-owed");

  await you.getByRole("button", { name: "Change" }).click();
  await you.getByRole("button", { name: "Ana" }).click();
  await expect(you).toContainText("You owe €5.00.");

  expect(errors, "browser errors").toEqual([]);
});

test("my groups and who you are survive a browser restart", async ({
  browser,
  page,
  context,
}, testInfo) => {
  const name = `Road trip (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ben");
  const saved = await context.storageState();
  await context.close();

  // A new browser context holding only what the last one saved to disk.
  const restarted = await browser.newContext({
    ...testInfo.project.use,
    storageState: saved,
  });
  const again = await restarted.newPage();
  await again.goto("/");
  await again
    .getByRole("list", { name: "My groups" })
    .getByRole("link", { name })
    .click();
  await expect(
    again.getByRole("region", { name: "You in this group" })
  ).toContainText("You are Ben.");
  await restarted.close();
});

test("a browser that blocks storage still works, it just doesn't remember", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });
  const errors = watchForErrors(page);
  const name = `No storage (${testInfo.project.name} ${Date.now()})`;
  await createGroup(page, {
    name,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await sayWhoYouAre(page, "Ana");

  await page.getByRole("link", { name: "Add an expense" }).click();
  await expect(page.getByLabel("Paid by").locator("option:checked")).toHaveText(
    "Ana"
  );
  await page.getByLabel("Description").fill("Fuel");
  await page.getByLabel("Amount (EUR)").fill("40");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("listitem", { name: "Fuel" })).toBeVisible();

  // A new page load has nothing to go on, so it asks again.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(
    page.getByRole("region", { name: "Who are you?" })
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create group" })
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "My groups" })).toHaveCount(0);

  expect(errors, "browser errors").toEqual([]);
});

test("unreadable saved data is ignored", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("potluck.device", "{not json");
  });
  const errors = watchForErrors(page);
  await createGroup(page, {
    name: `Garbled (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  await expect(
    page.getByRole("region", { name: "Who are you?" })
  ).toBeVisible();
  expect(errors, "browser errors").toEqual([]);
});

test("who you are never reaches the server except as the payer you submit", async ({
  page,
  context,
}, testInfo) => {
  type Sent = {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  const sent: Promise<Sent>[] = [];
  context.on("request", (request) =>
    sent.push(
      request.allHeaders().then((headers) => ({
        method: request.method(),
        url: request.url(),
        headers,
        body: request.postData() ?? "",
      }))
    )
  );

  await createGroup(page, {
    name: `Private claim (${testInfo.project.name} ${Date.now()})`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });
  const formPath = new URL(page.url()).pathname + "/expenses/new";
  await sayWhoYouAre(page, "Ana");
  const you = page.getByRole("region", { name: "You in this group" });
  await you.getByRole("button", { name: "Change" }).click();
  await you.getByRole("button", { name: "Ben" }).click();
  await expect(you).toContainText("You are Ben.");

  await page.getByRole("link", { name: "Add an expense" }).click();
  const payer = page.getByLabel("Paid by");
  const anaId = await payer
    .locator("option", { hasText: "Ana" })
    .getAttribute("value");
  const benId = await payer.inputValue();
  expect(anaId).toMatch(/.+/);
  expect(benId).toMatch(/.+/);
  await page.getByLabel("Description").fill("Tickets");
  await page.getByLabel("Amount (EUR)").fill("30");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("listitem", { name: "Tickets" })).toBeVisible();
  await page.reload();
  await expect(you).toContainText("You are Ben.");

  const requests = await Promise.all(sent);
  const ids = [anaId!, benId!];
  for (const request of requests) {
    for (const id of ids) {
      expect(request.url, "a URL").not.toContain(id);
      expect(JSON.stringify(request.headers), "a header").not.toContain(id);
    }
  }
  // The only body naming a member is the expense the member submitted, and
  // Ben is in it as its payer.
  const naming = requests.filter((r) => ids.some((id) => r.body.includes(id)));
  expect(naming.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
    `POST ${formPath}`,
  ]);
  expect(naming[0].body).toMatch(
    new RegExp(`name="(_\\d+_)?payer"\\r\\n\\r\\n${benId}\\r\\n`)
  );
  const cookies = JSON.stringify(await context.cookies());
  for (const id of ids) expect(cookies, "a cookie").not.toContain(id);
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

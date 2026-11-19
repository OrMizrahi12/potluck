import { expect, test, type APIResponse } from "@playwright/test";
import { createGroup } from "./helpers";

// The headers every response carries (#89). Written out by hand, not imported
// from the config, so a change to the set has to change this list too.
const SECURITY_HEADERS = {
  "content-security-policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy":
    "accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()",
};

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    expect(headers[name], name).toBe(value);
}

test("the first page carries the security headers", async ({ request }) => {
  const response = await request.get("/");

  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test("a group link carries the security headers", async ({ page, request }) => {
  await createGroup(page, {
    name: `Headers ${Date.now()}`,
    currency: "EUR",
    memberNames: ["Ana", "Ben"],
  });

  const response = await request.get(new URL(page.url()).pathname);

  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

// Proxy rewrites an unknown link to /g/no-group (src/app/g/group-link-proxy.ts);
// the rewritten 404 still has to carry them.
test("a link no group has carries the security headers", async ({
  request,
}) => {
  const response = await request.get("/g/AAAAAAAAAAAAAAAAAAAAAA");

  expect(response.status()).toBe(404);
  expectSecurityHeaders(response);
});

test("the health check carries the security headers", async ({ request }) => {
  // Its status follows the database's health (503 when it's down), which isn't
  // this test's subject: only the headers are.
  const response = await request.get("/api/health");

  expectSecurityHeaders(response);
});

import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubErrorReport } from "./scrub";

// A real-looking link token: 22 URL-safe characters, as createGroup mints.
const TOKEN = "q7Xk2LmP9vRt4WzYb3NcHd";
/** A documentation-only address (RFC 5737): it can't be anyone's. */
const IP = "203.0.113.7";

describe("an error report", () => {
  it("leaves Sentry with no link token, IP address or cookie", () => {
    const scrubbed = scrubErrorReport({
      type: undefined,
      message: `Failed to load https://potluck-zeta.vercel.app/g/${TOKEN}/expenses/new`,
      transaction: `GET /g/${TOKEN}/settings`,
      user: { ip_address: IP },
      request: {
        url: `https://potluck-zeta.vercel.app/g/${TOKEN}`,
        query_string: `back=/g/${TOKEN}`,
        cookies: { potluck_device: "secret-cookie-value" },
        headers: {
          cookie: "potluck_device=secret-cookie-value",
          "x-forwarded-for": IP,
          referer: `https://potluck-zeta.vercel.app/g/${TOKEN}`,
        },
        data: { next: `/g/${TOKEN}/settlements/new` },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: `No group at /g/${TOKEN}`,
            stacktrace: {
              frames: [{ function: "load", vars: { path: `/g/${TOKEN}` } }],
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/", to: `/g/${TOKEN}` },
        },
      ],
    });

    const sent = JSON.stringify(scrubbed);
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain(IP);
    expect(sent).not.toContain("secret-cookie-value");
    expect(scrubbed.request?.url).toBe(
      "https://potluck-zeta.vercel.app/g/[token]"
    );
    expect(scrubbed.transaction).toBe("GET /g/[token]/settings");
  });
});

describe("a breadcrumb", () => {
  it("names a group link without its link token", () => {
    const scrubbed = scrubBreadcrumb({
      category: "fetch",
      message: `POST /g/${TOKEN}/expenses/new`,
      data: { url: `/g/${TOKEN}/rate?currency=USD`, method: "GET" },
    });

    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
    expect(scrubbed.data?.url).toBe("/g/[token]/rate?currency=USD");
    expect(scrubbed.message).toBe("POST /g/[token]/expenses/new");
  });
});

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { sendCheckIn } from "./sentry-check-in.mjs";

type Received = { method?: string; url?: string; body: unknown };

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

/** A stand-in for Sentry's ingest host that records each request it gets. */
async function serveIngest(
  status = 202
): Promise<{ host: string; received: Received[] }> {
  const received: Received[] = [];
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        url: request.url,
        body: raw ? JSON.parse(raw) : null,
      });
      response.writeHead(status, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return {
    host: `127.0.0.1:${(server!.address() as AddressInfo).port}`,
    received,
  };
}

describe("Sentry cron check-in", () => {
  it("posts the status and monitor config to the cron endpoint the DSN names", async () => {
    const { host, received } = await serveIngest();

    const result = await sendCheckIn({
      dsn: `http://publickey123@${host}/4507`,
      slug: "potluck-nightly-backup",
      status: "in_progress",
      checkInId: "0f9e8d7c-6b5a-4321-8765-0123456789ab",
      monitorConfig: {
        schedule: { type: "crontab", value: "23 3 * * *" },
        checkin_margin: 180,
        max_runtime: 30,
        timezone: "UTC",
      },
    });

    expect(result.sent).toBe(true);
    expect(received).toEqual([
      {
        method: "POST",
        url: "/api/4507/cron/potluck-nightly-backup/publickey123/",
        body: {
          status: "in_progress",
          check_in_id: "0f9e8d7c-6b5a-4321-8765-0123456789ab",
          monitor_config: {
            schedule: { type: "crontab", value: "23 3 * * *" },
            checkin_margin: 180,
            max_runtime: 30,
            timezone: "UTC",
          },
        },
      },
    ]);
  });

  it("reports a refused check-in without throwing or naming the key", async () => {
    const { host } = await serveIngest(429);

    const result = await sendCheckIn({
      dsn: `http://publickey123@${host}/4507`,
      slug: "potluck-nightly-backup",
      status: "ok",
      checkInId: "0f9e8d7c-6b5a-4321-8765-0123456789ab",
      monitorConfig: { schedule: { type: "crontab", value: "23 3 * * *" } },
    });

    expect(result).toEqual({
      sent: false,
      summary: expect.stringContaining("429"),
    });
    expect(result.summary).not.toContain("publickey123");
  });

  it.each([
    [
      "an ingest host that doesn't answer",
      "http://publickey123@127.0.0.1:1/4507",
    ],
    ["a DSN that isn't one", "publickey123 pasted wrong"],
  ])("reports %s without throwing or naming the key", async (_, dsn) => {
    const result = await sendCheckIn({
      dsn,
      slug: "potluck-nightly-backup",
      status: "error",
      checkInId: "0f9e8d7c-6b5a-4321-8765-0123456789ab",
      monitorConfig: { schedule: { type: "crontab", value: "23 3 * * *" } },
    });

    expect(result.sent).toBe(false);
    expect(result.summary).not.toContain("publickey123");
  });
});

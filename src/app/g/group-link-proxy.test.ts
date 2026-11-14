import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createGroup } from "../../group/service";
import { createTestDb } from "../../test/db";
import { answerGroupLink } from "./group-link-proxy";

describe("group link", () => {
  it("sends a link no group has to the prerendered 404", async () => {
    const db = await createTestDb();

    const response = await answerGroupLink(
      db,
      new NextRequest("http://localhost/g/AAAAAAAAAAAAAAAAAAAAAA")
    );

    // The rewrite target decides the status: /g/no-group is prerendered with
    // notFound(), so production serves it as a 404. A status set on the Proxy's
    // own response is dropped for the partially prerendered group page.
    if (!response) throw new Error("passed through");
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("http://localhost/g/no-group");
  });

  it("passes through to the group's page when a group has the link", async () => {
    const db = await createTestDb();
    const created = await createGroup(db, {
      name: "Lisbon trip",
      currency: "EUR",
      memberNames: ["Ana", "Ben"],
    });
    if (!created.ok) throw new Error(`refused: ${created.reason}`);

    const response = await answerGroupLink(
      db,
      new NextRequest(`http://localhost/g/${created.view.linkToken}`)
    );

    // Proxy's contract: returning nothing lets the request reach the page.
    expect(response).toBeUndefined();
  });
});

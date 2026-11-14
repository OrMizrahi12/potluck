import { NextResponse, type NextRequest } from "next/server";
import type { Db } from "../../db/types";
import { hasGroup } from "../../group/service";

/**
 * Proxy's answer for `/g/:token`. With Cache Components the page sends a 200
 * before its own lookup runs, so only a check here can make an unknown group
 * link answer 404 (#21). An unknown link is rewritten to /g/no-group, which is
 * prerendered as a 404 showing "No group at this link". Setting a 404 status on
 * a rewrite to the group page itself works in dev but not in production, where
 * the prerendered shell's 200 wins. Returning nothing lets a real group link
 * through untouched.
 *
 * A failed lookup throws: an error, never a pass-through or a 404.
 */
export async function answerGroupLink(
  db: Db,
  request: NextRequest
): Promise<NextResponse | undefined> {
  // Only `/g/<one segment>` is a group link, whatever src/proxy.ts's matcher
  // lets through; anything else isn't this handler's to answer.
  const linkToken = /^\/g\/([^/]+)$/.exec(request.nextUrl.pathname)?.[1];
  if (linkToken === undefined || (await hasGroup(db, linkToken)))
    return undefined;
  return NextResponse.rewrite(new URL("/g/no-group", request.url));
}

import type { NextRequest } from "next/server";
import { answerGroupLink } from "./app/g/group-link-proxy";
import { getDb } from "./db/client";

export function proxy(request: NextRequest) {
  return answerGroupLink(getDb(), request);
}

export const config = { matcher: "/g/:token" };

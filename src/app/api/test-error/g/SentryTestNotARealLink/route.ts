import { connection } from "next/server";
import { answerTestError } from "@/sentry/test-error";

// #67's test error: open this path on a production deploy's own URL, signed in
// to Vercel, and Sentry receives an error with the link token scrubbed. It
// answers 404 on the public address and outside Vercel (src/sentry/test-error.ts).
export async function GET(request: Request) {
  await connection(); // read the request per visit, never at build
  return answerTestError(request, process.env);
}

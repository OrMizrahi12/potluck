import { connection } from "next/server";
import { answerAsFakeFrankfurter } from "@/group/fake-frankfurter";

// The fake rate source local runs and browser tests ask (see
// src/group/fake-frankfurter.ts). It answers 404 on any Vercel deployment.
export async function GET(request: Request) {
  await connection(); // read the environment per request, never at build
  return answerAsFakeFrankfurter(
    new URL(request.url),
    process.env,
    request.signal
  );
}

import { appInfo } from "./schema";
import type { Db } from "./types";

export async function readGreeting(db: Db): Promise<string | undefined> {
  const [row] = await db.select({ greeting: appInfo.greeting }).from(appInfo);
  return row?.greeting;
}

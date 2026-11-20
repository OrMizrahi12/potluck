import "server-only";
import { headers } from "next/headers";

/**
 * The visitor's preferred locale from Accept-Language, for formatting
 * amounts and dates on the server, or "en" when none is usable. The interface
 * itself stays in English.
 */
export async function visitorLocale(): Promise<string> {
  const accepted = (await headers()).get("accept-language") ?? "";
  for (const entry of accepted.split(",")) {
    const [range = ""] = entry.split(";");
    const tag = range.trim();
    if (tag === "" || tag === "*") continue;
    try {
      const [supported] = Intl.NumberFormat.supportedLocalesOf(tag);
      if (supported) return supported;
    } catch {
      // Not a well-formed language tag: try the next one.
    }
  }
  return "en";
}

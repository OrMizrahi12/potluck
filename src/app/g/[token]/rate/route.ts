import { getDb } from "@/db/client";
import { lookUpRate } from "@/group/rate-lookup";
import { rateSourceUrl } from "@/group/rate-source";

// The form's rate lookup: { foreignCurrency, date } in, the answer out. A
// route handler, not a server action: Next runs a page's server actions one
// at a time, so a slow lookup would hold up saving. The group link sits in
// the path, which the dev log masks under /g/.
export async function POST(
  request: Request,
  ctx: RouteContext<"/g/[token]/rate">
) {
  const { token } = await ctx.params;
  const body: unknown = await request.json().catch(() => undefined);
  const field = (name: string): string => {
    const value =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)[name]
        : undefined;
    return typeof value === "string" ? value : "";
  };
  const result = await lookUpRate(
    getDb(),
    {
      source: { url: rateSourceUrl(process.env), fetch },
      now: () => new Date(),
    },
    {
      linkToken: token,
      foreignCurrency: field("foreignCurrency"),
      date: field("date"),
    }
  );
  if (!result.ok) {
    return Response.json(
      { refusal: result.reason },
      { status: result.reason === "group-unknown" ? 404 : 400 }
    );
  }
  return Response.json(result.answer);
}

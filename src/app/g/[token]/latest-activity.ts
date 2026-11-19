import type { GroupView } from "@/group/service";

/**
 * The most recent calendar date (YYYY-MM-DD) of any expense or settlement in
 * the group, or undefined when the group has neither yet. Either list may be
 * empty; both must be newest first, as `GroupView` keeps them.
 */
export function latestActivityDate(
  group: Pick<GroupView, "expenses" | "settlements">
): string | undefined {
  const latestExpense = group.expenses[0]?.date;
  const latestSettlement = group.settlements[0]?.date;
  if (latestExpense === undefined) return latestSettlement;
  if (latestSettlement === undefined) return latestExpense;
  return latestExpense >= latestSettlement ? latestExpense : latestSettlement;
}

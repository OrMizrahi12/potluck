import type { GroupView } from "@/group/service";

/**
 * The most recent calendar date (YYYY-MM-DD) of any expense or settlement in
 * the group, or undefined when the group has neither yet.
 */
export function latestActivityDate(
  group: Pick<GroupView, "expenses" | "settlements">
): string | undefined {
  if (group.expenses.length === 0 && group.settlements.length === 0) {
    return undefined;
  }
  const latestExpense = group.expenses[0].date;
  const latestSettlement = group.settlements[0]?.date;
  if (!latestSettlement) return latestExpense;
  return latestExpense >= latestSettlement ? latestExpense : latestSettlement;
}

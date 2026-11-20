import { formatAmount } from "./format";

export type GroupSummaryInput = {
  groupName: string;
  /** The group currency: ISO 4217 code and its ISO number of decimals. */
  currency: { currency: string; digits: number };
  locale: string;
  /** Minor units. */
  groupSpending: number;
  /** In page order, inactive members included. */
  members: { name: string; balance: number }[];
  suggestedSettlements: { fromName: string; toName: string; amount: number }[];
};

/**
 * The plain-text summary a member pastes into their group chat: English
 * labels, no markdown, no date and no link.
 */
export function formatGroupSummary({
  groupName,
  currency,
  locale,
  groupSpending,
  members,
  suggestedSettlements,
}: GroupSummaryInput): string {
  const money = (minor: number) => formatAmount(minor, currency, locale);

  const balances = members.map(({ name, balance }) => {
    if (balance > 0) return `${name} is owed ${money(balance)}`;
    if (balance < 0) return `${name} owes ${money(-balance)}`;
    return `${name} is settled up`;
  });

  const settlements =
    suggestedSettlements.length === 0
      ? ["Everyone is settled up."]
      : suggestedSettlements.map(
          ({ fromName, toName, amount }) =>
            `${fromName} pays ${toName} ${money(amount)}`
        );

  return [
    groupName,
    `Group spending: ${money(groupSpending)}`,
    "",
    "Balances",
    ...balances,
    "",
    "Suggested settlements",
    ...settlements,
  ].join("\n");
}

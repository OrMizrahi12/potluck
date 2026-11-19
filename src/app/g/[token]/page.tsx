import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findCurrency } from "@/currency/currencies";
import { getDb } from "@/db/client";
import { LIMITS } from "@/group/limits";
import {
  EXPENSE_PAGE_SIZE,
  readGroupView,
  type GroupView,
} from "@/group/service";
import { formatRate } from "@/money/foreign-amount";
import { formatAmount, formatDate } from "@/money/format";
import { visitorLocale } from "../../locale";
import { GroupLink } from "./group-link";
import { latestActivityDate } from "./latest-activity";
import { WhoAreYou } from "./who-are-you";

export const metadata: Metadata = {
  title: "Group · Potluck",
  // The link is the group's only credential: keep it out of search engines
  // and out of the Referer header sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** How many expenses `?expenses=` asks for: a page more each time, up to the cap. */
function expenseLimit(asked: string | string[] | undefined): number {
  const n = Number(typeof asked === "string" ? asked : undefined);
  if (!Number.isInteger(n) || n < EXPENSE_PAGE_SIZE) return EXPENSE_PAGE_SIZE;
  return Math.min(n, LIMITS.expenses);
}

async function Group({ token, shown }: { token: string; shown: number }) {
  const [group, locale] = await Promise.all([
    readGroupView(getDb(), token, { expenseLimit: shown }),
    visitorLocale(),
  ]);
  if (!group) notFound();
  const currency = findCurrency(group.currency);
  const money = (minor: number) => formatAmount(minor, group, locale);
  const nameOf = new Map(group.members.map((m) => [m.id, m.name]));
  const latestActivity = latestActivityDate(group);

  return (
    <>
      <h1>{group.name}</h1>
      <WhoAreYou
        token={token}
        name={group.name}
        members={group.members.map(({ id, name, balance }) => ({
          id,
          name,
          balance,
          amount: money(Math.abs(balance)),
        }))}
      />
      <p>
        Currency: {group.currency}
        {currency && ` · ${currency.name}`}
        {latestActivity &&
          ` · Latest activity: ${formatDate(latestActivity, locale)}`}{" "}
        · <Link href={`/g/${token}/settings`}>Group settings</Link>
      </p>

      <div className="actions">
        <Link className="button" href={`/g/${token}/expenses/new`}>
          Add an expense
        </Link>
        <Link className="button secondary" href={`/g/${token}/settlements/new`}>
          Record a settlement
        </Link>
      </div>

      <h2 id="balances">Balances</h2>
      <ul className="balances" aria-labelledby="balances">
        {group.members.map((member) => (
          <li key={member.id}>
            <span className="name">{member.name}</span>{" "}
            <Balance balance={member.balance} money={money} />
          </li>
        ))}
      </ul>

      <h2 id="suggested-settlements">Suggested settlements</h2>
      {group.suggestedSettlements.length === 0 ? (
        <p>Everyone is settled up.</p>
      ) : (
        <ul className="settlements" aria-labelledby="suggested-settlements">
          {group.suggestedSettlements.map((s) => (
            <li key={`${s.fromId}-${s.toId}`}>
              <span>
                <span className="name">{nameOf.get(s.fromId)}</span> pays{" "}
                <span className="name">{nameOf.get(s.toId)}</span>{" "}
                <span className="amount">{money(s.amount)}</span>
              </span>{" "}
              <Link
                href={`/g/${token}/settlements/new?${new URLSearchParams({
                  from: s.fromId,
                  to: s.toId,
                  amount: String(s.amount),
                })}`}
              >
                Record this settlement
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 id="expenses">Expenses</h2>
      {group.expenses.length === 0 ? (
        <p>No expenses yet.</p>
      ) : (
        <ul className="expenses" aria-labelledby="expenses">
          {group.expenses.map((expense) => (
            <Expense
              key={expense.id}
              expense={expense}
              nameOf={nameOf}
              money={money}
              locale={locale}
              editHref={`/g/${token}/expenses/${expense.id}`}
              groupCurrency={group.currency}
            />
          ))}
        </ul>
      )}
      {group.hasOlderExpenses && (
        <Link
          className="button secondary"
          href={`/g/${token}?expenses=${shown + EXPENSE_PAGE_SIZE}`}
          scroll={false}
        >
          Show older expenses
        </Link>
      )}

      <h2 id="settlements">Settlements</h2>
      {group.settlements.length === 0 ? (
        <p>No settlements yet.</p>
      ) : (
        <ul className="settlements" aria-labelledby="settlements">
          {group.settlements.map((s) => (
            <li key={s.id}>
              <span>
                <span className="name">{nameOf.get(s.fromId)}</span> paid{" "}
                <span className="name">{nameOf.get(s.toId)}</span>{" "}
                <span className="amount">{money(s.amount)}</span>
                {s.foreign && (
                  <>
                    {" "}
                    <span className="muted">
                      ({formatAmount(s.foreign.amount, s.foreign, locale)})
                    </span>
                  </>
                )}
              </span>{" "}
              <span className="muted">{formatDate(s.date, locale)}</span>{" "}
              <Link
                href={`/g/${token}/settlements/${s.id}`}
                aria-label={`Edit the settlement from ${nameOf.get(s.fromId)} to ${nameOf.get(s.toId)}`}
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}

      <GroupLink />
    </>
  );
}

function Balance({
  balance,
  money,
}: {
  balance: number;
  money: (minor: number) => string;
}) {
  if (balance > 0)
    return <span className="owed">is owed {money(balance)}</span>;
  if (balance < 0) return <span className="owes">owes {money(-balance)}</span>;
  return <span>settled up</span>;
}

function Expense({
  expense,
  nameOf,
  money,
  locale,
  editHref,
  groupCurrency,
}: {
  expense: GroupView["expenses"][number];
  nameOf: Map<string, string>;
  money: (minor: number) => string;
  locale: string;
  editHref: string;
  groupCurrency: string;
}) {
  const { foreign } = expense;
  return (
    <li aria-label={expense.description}>
      <div className="expense-head">
        <span className="name">{expense.description}</span>
        <span className="amount">{money(expense.amount)}</span>
      </div>
      <p className="muted">
        {foreign && (
          <>
            Paid {formatAmount(foreign.amount, foreign, locale)} at 1{" "}
            {foreign.currency} = {formatRate(foreign.rate)} {groupCurrency}{" "}
            ·{" "}
          </>
        )}
        Paid by {nameOf.get(expense.payerId)} ·{" "}
        {formatDate(expense.date, locale)} ·{" "}
        <Link href={editHref} aria-label={`Edit ${expense.description}`}>
          Edit
        </Link>
      </p>
      <ul className="shares" aria-label="Shares">
        {expense.shares.map((s) => (
          <li key={s.memberId}>
            <span className="name">{nameOf.get(s.memberId)}</span>{" "}
            <span className="amount">
              {money(s.share)}
              {s.extra === 1 && <span className="leftover"> · rounded up</span>}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function GroupPage({
  params,
  searchParams,
}: PageProps<"/g/[token]">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the group…</p>}>
        {Promise.all([params, searchParams]).then(([{ token }, query]) => (
          <Group token={token} shown={expenseLimit(query.expenses)} />
        ))}
      </Suspense>
    </main>
  );
}

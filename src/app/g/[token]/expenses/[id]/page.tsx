import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { LIMITS } from "@/group/limits";
import { readGroupView } from "@/group/service";
import { visitorLocale } from "../../../../locale";
import { minorToDecimal } from "@/money/amount";
import { DeleteEntry } from "../../delete-entry";
import { MissingEntry } from "../../missing-entry";
import { ExpenseForm } from "../expense-form";
import { deleteExpenseAction, editExpenseAction } from "./actions";

export const metadata: Metadata = {
  title: "Edit an expense · Potluck",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function EditExpense({ token, id }: { token: string; id: string }) {
  // Balances already read every expense, so asking for all of them finds
  // this one without a second kind of read.
  const [group, locale] = await Promise.all([
    readGroupView(getDb(), token, { expenseLimit: LIMITS.expenses }),
    visitorLocale(),
  ]);
  const expense = group?.expenses.find((e) => e.id === id);
  if (!group) notFound();
  if (!expense)
    return (
      <MissingEntry token={token} groupName={group.name} entry="expense" />
    );

  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {group.name}</Link>
      </p>
      <h1>Edit an expense</h1>
      {/* Keyed by version: a page kept from an earlier visit starts afresh
          from the latest version instead of keeping an older one's fields. */}
      <ExpenseForm
        key={`edit-${expense.version}`}
        action={editExpenseAction.bind(null, token, id, expense.version)}
        token={token}
        currency={group.currency}
        digits={group.digits}
        locale={locale}
        members={group.members.map(({ id, name, active }) => ({
          id,
          name,
          active,
        }))}
        initial={{
          description: expense.description,
          amount: minorToDecimal(expense.amount, group.digits),
          date: expense.date,
          payerId: expense.payerId,
          participantIds: expense.shares.map((s) => s.memberId),
          foreign: expense.foreign && {
            amount: minorToDecimal(
              expense.foreign.amount,
              expense.foreign.digits
            ),
            currency: expense.foreign.currency,
            rate: expense.foreign.rate,
          },
        }}
      />
      <h2>Delete</h2>
      <DeleteEntry
        key={`delete-${expense.version}`}
        action={deleteExpenseAction.bind(null, token, id, expense.version)}
        entry="expense"
      />
    </>
  );
}

export default function EditExpensePage({
  params,
}: PageProps<"/g/[token]/expenses/[id]">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the expense…</p>}>
        {params.then(({ token, id }) => (
          <EditExpense token={token} id={id} />
        ))}
      </Suspense>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { readGroupView } from "@/group/service";
import { visitorLocale } from "../../../../locale";
import { addExpenseAction } from "./actions";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = {
  title: "Add an expense · Potluck",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function NewExpense({ token }: { token: string }) {
  const [group, locale] = await Promise.all([
    readGroupView(getDb(), token, { expenseLimit: 0 }),
    visitorLocale(),
  ]);
  if (!group) notFound();

  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {group.name}</Link>
      </p>
      <h1>Add an expense</h1>
      <ExpenseForm
        action={addExpenseAction.bind(null, token)}
        token={token}
        currency={group.currency}
        digits={group.digits}
        locale={locale}
        members={group.members.map(({ id, name, active }) => ({
          id,
          name,
          active,
        }))}
      />
    </>
  );
}

export default function NewExpensePage({
  params,
}: PageProps<"/g/[token]/expenses/new">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the group…</p>}>
        {params.then(({ token }) => (
          <NewExpense token={token} />
        ))}
      </Suspense>
    </main>
  );
}

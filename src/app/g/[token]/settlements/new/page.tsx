import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { readGroupView } from "@/group/service";
import { minorToDecimal, parseAmount } from "@/money/amount";
import { visitorLocale } from "../../../../locale";
import { addSettlementAction } from "./actions";
import { SettlementForm } from "../settlement-form";

export const metadata: Metadata = {
  title: "Record a settlement · Potluck",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Query = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

async function NewSettlement({
  token,
  query,
}: {
  token: string;
  query: Query;
}) {
  const [group, locale] = await Promise.all([
    readGroupView(getDb(), token, { expenseLimit: 0 }),
    visitorLocale(),
  ]);
  if (!group) notFound();

  // A suggested settlement links here with from, to and amount in minor units.
  // Anything that isn't a member or an amount is left blank, not trusted.
  const memberIds = new Set(group.members.map((m) => m.id));
  const member = (id: string) => (memberIds.has(id) ? id : "");
  const minor = parseAmount(one(query.amount), 0);
  const amount =
    minor !== undefined && Number.isSafeInteger(minor) && minor > 0
      ? minorToDecimal(minor, group.digits)
      : "";
  const initial = {
    fromId: member(one(query.from)),
    toId: member(one(query.to)),
    amount,
  };

  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {group.name}</Link>
      </p>
      <h1>Record a settlement</h1>
      <p className="muted">
        One member paid another outside Potluck: paying back, or lending.
      </p>
      <SettlementForm
        // Another suggestion opens the same page; a new key starts the form
        // afresh instead of keeping the last one's state.
        key={`${initial.fromId}/${initial.toId}/${initial.amount}`}
        action={addSettlementAction.bind(null, token)}
        token={token}
        currency={group.currency}
        digits={group.digits}
        locale={locale}
        members={group.members.map(({ id, name }) => ({ id, name }))}
        initial={initial}
      />
    </>
  );
}

export default function NewSettlementPage({
  params,
  searchParams,
}: PageProps<"/g/[token]/settlements/new">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the group…</p>}>
        {Promise.all([params, searchParams]).then(([{ token }, query]) => (
          <NewSettlement token={token} query={query} />
        ))}
      </Suspense>
    </main>
  );
}

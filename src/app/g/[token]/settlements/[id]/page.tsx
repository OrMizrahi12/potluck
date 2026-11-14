import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { readGroupView } from "@/group/service";
import { minorToDecimal } from "@/money/amount";
import { DeleteEntry } from "../../delete-entry";
import { MissingEntry } from "../../missing-entry";
import { SettlementForm } from "../settlement-form";
import { deleteSettlementAction, editSettlementAction } from "./actions";

export const metadata: Metadata = {
  title: "Edit a settlement · Potluck",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function EditSettlement({ token, id }: { token: string; id: string }) {
  const group = await readGroupView(getDb(), token, { expenseLimit: 0 });
  const settlement = group?.settlements.find((s) => s.id === id);
  if (!group) notFound();
  if (!settlement)
    return (
      <MissingEntry token={token} groupName={group.name} entry="settlement" />
    );

  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {group.name}</Link>
      </p>
      <h1>Edit a settlement</h1>
      {/* Keyed by version: a page kept from an earlier visit starts afresh
          from the latest version instead of keeping an older one's fields. */}
      <SettlementForm
        key={`edit-${settlement.version}`}
        action={editSettlementAction.bind(null, token, id, settlement.version)}
        currency={group.currency}
        digits={group.digits}
        members={group.members.map(({ id, name }) => ({ id, name }))}
        initial={{
          fromId: settlement.fromId,
          toId: settlement.toId,
          amount: minorToDecimal(settlement.amount, group.digits),
          date: settlement.date,
        }}
        editing
      />
      <h2>Delete</h2>
      <DeleteEntry
        key={`delete-${settlement.version}`}
        action={deleteSettlementAction.bind(
          null,
          token,
          id,
          settlement.version
        )}
        entry="settlement"
      />
    </>
  );
}

export default function EditSettlementPage({
  params,
}: PageProps<"/g/[token]/settlements/[id]">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the settlement…</p>}>
        {params.then(({ token, id }) => (
          <EditSettlement token={token} id={id} />
        ))}
      </Suspense>
    </main>
  );
}

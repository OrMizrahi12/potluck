import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findCurrency } from "@/currency/currencies";
import { getDb } from "@/db/client";
import { LIMITS } from "@/group/limits";
import { readGroupView } from "@/group/service";
import {
  AddMemberForm,
  ChangeCurrencyForm,
  DeleteGroupForm,
  DeleteMemberForm,
  MemberActiveForm,
  RenameMemberForm,
} from "./settings-forms";

export const metadata: Metadata = {
  title: "Group settings · Potluck",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Settings({ token }: { token: string }) {
  // One expense is enough to know whether the group has any.
  const group = await readGroupView(getDb(), token, { expenseLimit: 1 });
  if (!group) notFound();
  const hasEntries = group.expenses.length > 0 || group.settlements.length > 0;
  const currency = findCurrency(group.currency);

  return (
    <>
      <p>
        <Link href={`/g/${token}`}>← {group.name}</Link>
      </p>
      <h1>Group settings</h1>

      <h2 id="members">Members</h2>
      <ul className="member-settings" aria-labelledby="members">
        {group.members.map((member) => (
          // Keyed by version too, so a member that changed starts afresh.
          <li
            key={`${member.id}/${member.version}`}
            aria-label={member.name}
            className="stack"
          >
            <RenameMemberForm token={token} member={member} />
            {!member.active && (
              <p className="muted">
                <strong>Inactive</strong>: not pre-selected in new expenses, but
                still in balances and suggested settlements.
              </p>
            )}
            <div className="actions">
              <MemberActiveForm token={token} member={member} />
              {!member.referenced && (
                <DeleteMemberForm token={token} member={member} />
              )}
            </div>
            {member.referenced && (
              <p className="muted">
                In an expense or a settlement, so {member.name} can&apos;t be
                deleted. Make them inactive instead.
              </p>
            )}
          </li>
        ))}
      </ul>
      {group.members.length < LIMITS.members ? (
        <AddMemberForm token={token} />
      ) : (
        <p>This group has reached its limit of {LIMITS.members} members.</p>
      )}

      <h2>Currency</h2>
      <p>
        The currency is {group.currency}
        {currency && ` · ${currency.name}`}.
        {hasEntries &&
          " It can't be changed once the group has an expense or a settlement, so existing amounts keep their meaning."}
      </p>
      {!hasEntries && (
        <ChangeCurrencyForm
          // A new currency starts the form afresh.
          key={group.version}
          token={token}
          group={group}
        />
      )}

      <h2>Delete the group</h2>
      <p className="muted">
        Deletes the group and everything in it for everyone.
      </p>
      <DeleteGroupForm token={token} group={group} />
    </>
  );
}

export default function SettingsPage({
  params,
}: PageProps<"/g/[token]/settings">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the group…</p>}>
        {params.then(({ token }) => (
          <Settings token={token} />
        ))}
      </Suspense>
    </main>
  );
}

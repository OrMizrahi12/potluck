import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findCurrency } from "@/currency/currencies";
import { getDb } from "@/db/client";
import { readGroupView } from "@/group/service";
import { ShareLink } from "./share-link";

export const metadata: Metadata = {
  title: "Group · Potluck",
  // The link is the group's only credential: keep it out of search engines
  // and out of the Referer header sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Group({ token }: { token: string }) {
  const group = await readGroupView(getDb(), token);
  if (!group) notFound();
  const currency = findCurrency(group.currency);

  return (
    <>
      <h1>{group.name}</h1>
      <p>
        Currency: {group.currency}
        {currency && ` · ${currency.name}`}
      </p>

      <ShareLink />

      <h2>Members</h2>
      <ul className="members">
        {group.members.map((member) => (
          <li key={member.id}>{member.name}</li>
        ))}
      </ul>
    </>
  );
}

export default function GroupPage({ params }: PageProps<"/g/[token]">) {
  return (
    <main>
      <Suspense fallback={<p>Opening the group…</p>}>
        {params.then(({ token }) => (
          <Group token={token} />
        ))}
      </Suspense>
    </main>
  );
}

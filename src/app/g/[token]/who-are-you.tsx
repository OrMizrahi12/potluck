"use client";

import { useEffect, useState } from "react";
import {
  claimMember,
  rememberGroup,
  skipClaim,
  useClaim,
} from "@/device/store";

type Member = { id: string; name: string };

type MemberWithBalance = Member & {
  balance: number;
  /** The balance's size, formatted in the group's currency. */
  amount: string;
};

/** One button per member; choosing one makes it this device's member in the group. */
function MemberChoice({
  token,
  members,
  current,
  onChosen,
}: {
  token: string;
  members: Member[];
  current?: string;
  onChosen?: () => void;
}) {
  return (
    <div className="choices">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          className="secondary"
          aria-pressed={current === undefined ? undefined : m.id === current}
          onClick={() => {
            claimMember(token, m.id);
            onChosen?.();
          }}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Asks which member this device is. With `skippable`, it can be put off to
 * look around the group; without, it must be answered to go on.
 */
export function WhoAreYouPrompt({
  token,
  members,
  skippable,
  children,
}: {
  token: string;
  members: Member[];
  skippable: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="prompt stack" aria-labelledby="who-are-you">
      <h2 id="who-are-you">Who are you?</h2>
      <p>{children}</p>
      <MemberChoice token={token} members={members} />
      {skippable && (
        <button
          type="button"
          className="secondary"
          onClick={() => skipClaim(token)}
        >
          Skip, just looking
        </button>
      )}
    </section>
  );
}

/**
 * Remembers the group on this device and, the first time, asks which member
 * this device is. The answer stays on the device; the server never sees it.
 */
export function WhoAreYou({
  token,
  name,
  members,
}: {
  token: string;
  name: string;
  members: MemberWithBalance[];
}) {
  useEffect(() => rememberGroup({ token, name }), [token, name]);
  const claim = useClaim(
    token,
    members.map((m) => m.id)
  );
  if (!claim) return null;
  if (!claim.claimed && !claim.skipped)
    return (
      <WhoAreYouPrompt token={token} members={members} skippable>
        Pick your name so Potluck can fill you in as the payer and show what you
        owe or are owed. It&apos;s only remembered on this device.
      </WhoAreYouPrompt>
    );

  return (
    <YouMenu
      token={token}
      members={members}
      you={members.find((m) => m.id === claim.claimed)}
    />
  );
}

/** Who this device is in the group, with a menu to change it at any time. */
function YouMenu({
  token,
  members,
  you,
}: {
  token: string;
  members: Member[];
  you: MemberWithBalance | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="you stack" aria-label="You in this group">
      <div className="row">
        <p className="name">
          {you ? `You are ${you.name}.` : "You haven't said who you are."}
          {you && " "}
          {you && <YourBalance you={you} />}
        </p>
        <button
          type="button"
          className="secondary"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {you ? "Change" : "Say who you are"}
        </button>
      </div>
      {open && (
        <MemberChoice
          token={token}
          members={members}
          current={you?.id}
          onChosen={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function YourBalance({ you }: { you: MemberWithBalance }) {
  if (you.balance > 0)
    return <strong className="owed">You are owed {you.amount}.</strong>;
  if (you.balance < 0)
    return <strong className="owes">You owe {you.amount}.</strong>;
  return <strong>You are settled up.</strong>;
}

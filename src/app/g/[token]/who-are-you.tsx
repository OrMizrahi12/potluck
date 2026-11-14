"use client";

import { useEffect } from "react";
import {
  claimMember,
  rememberGroup,
  skipClaim,
  useClaim,
} from "@/device/store";

type Member = { id: string; name: string };

/** One button per member; choosing one makes it this device's member in the group. */
export function MemberChoice({
  token,
  members,
}: {
  token: string;
  members: Member[];
}) {
  return (
    <div className="choices">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          className="secondary"
          onClick={() => claimMember(token, m.id)}
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
  members: Member[];
}) {
  useEffect(() => rememberGroup({ token, name }), [token, name]);
  const claim = useClaim(
    token,
    members.map((m) => m.id)
  );
  if (!claim || claim.claimed || claim.skipped) return null;

  return (
    <WhoAreYouPrompt token={token} members={members} skippable>
      Pick your name so Potluck can fill you in as the payer and show what you
      owe or are owed. It&apos;s only remembered on this device.
    </WhoAreYouPrompt>
  );
}

"use client";

import Link from "next/link";
import { useMyGroups } from "@/device/store";

/** The groups opened on this device, so a member can return without the link. */
export function MyGroups() {
  const groups = useMyGroups();
  if (!groups || groups.length === 0) return null;

  return (
    <>
      <h2 id="my-groups">My groups</h2>
      <ul className="my-groups" aria-labelledby="my-groups">
        {groups.map((group) => (
          <li key={group.token}>
            <Link href={`/g/${group.token}`}>{group.name}</Link>
          </li>
        ))}
      </ul>
      <p className="muted">Listed only on this device.</p>
    </>
  );
}

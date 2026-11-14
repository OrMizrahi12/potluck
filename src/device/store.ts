"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * The device store: the groups opened on this device and the member this
 * device claims in each. It lives in the browser's local storage and is
 * never sent to the server. Where storage is missing or blocked, it keeps
 * what it's told in memory for as long as the page stays open, so pages
 * work the same and only forget sooner.
 */

/** A group opened on this device, newest first in the list. */
export type DeviceGroup = { token: string; name: string };

type Saved = {
  groups: DeviceGroup[];
  /** The member claimed in each group, by the group's link token. */
  claims: Record<string, string>;
  /** Groups where "Who are you?" was skipped, by link token. */
  skipped: string[];
};

const KEY = "potluck.device";
const EMPTY: Saved = { groups: [], claims: {}, skipped: [] };

/** What couldn't be written to storage, kept here instead. */
let unsaved: string | undefined;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  if (unsaved !== undefined) return unsaved;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Saved {
  if (!raw) return EMPTY;
  try {
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      groups: Array.isArray(saved.groups)
        ? saved.groups.filter(
            (g): g is DeviceGroup =>
              typeof g?.token === "string" && typeof g?.name === "string"
          )
        : [],
      claims:
        saved.claims && typeof saved.claims === "object" ? saved.claims : {},
      skipped: Array.isArray(saved.skipped)
        ? saved.skipped.filter((t): t is string => typeof t === "string")
        : [],
    };
  } catch {
    return EMPTY;
  }
}

function update(change: (saved: Saved) => Saved) {
  const raw = JSON.stringify(change(parse(readRaw())));
  try {
    window.localStorage.setItem(KEY, raw);
    unsaved = undefined;
  } catch {
    unsaved = raw;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab on this device changed the store.
  const onStorage = (change: StorageEvent) => {
    if (change.key === KEY || change.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The store's contents, or `undefined` while the page is rendered on the
 * server and before it's hydrated, when the device isn't known yet.
 */
function useSaved(): Saved | undefined {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw]);
}

/** The groups opened on this device, most recently opened first. */
export function useMyGroups(): DeviceGroup[] | undefined {
  return useSaved()?.groups;
}

/**
 * What this device knows about its member in one group: `claimed` is the
 * member's id, if one is claimed and still among `memberIds`; `skipped` is
 * whether "Who are you?" was skipped there. `undefined` until hydrated.
 */
export function useClaim(
  token: string,
  memberIds: readonly string[]
): { claimed?: string; skipped: boolean } | undefined {
  const saved = useSaved();
  if (!saved) return undefined;
  const claimed = saved.claims[token];
  return {
    claimed: memberIds.includes(claimed) ? claimed : undefined,
    skipped: saved.skipped.includes(token),
  };
}

/** Puts the group at the top of this device's list, under its current name. */
export function rememberGroup(group: DeviceGroup) {
  update((saved) => ({
    ...saved,
    groups: [
      { token: group.token, name: group.name },
      ...saved.groups.filter((g) => g.token !== group.token),
    ],
  }));
}

/** Forgets everything this device knows about a group, once it's been deleted. */
export function forgetGroup(token: string) {
  update((saved) => ({
    groups: saved.groups.filter((g) => g.token !== token),
    claims: Object.fromEntries(
      Object.entries(saved.claims).filter(([t]) => t !== token)
    ),
    skipped: saved.skipped.filter((t) => t !== token),
  }));
}

/** Records which member this device is in the group. */
export function claimMember(token: string, memberId: string) {
  update((saved) => ({
    ...saved,
    claims: { ...saved.claims, [token]: memberId },
  }));
}

/** Records that "Who are you?" was skipped in the group, so it isn't asked again. */
export function skipClaim(token: string) {
  update((saved) => ({
    ...saved,
    skipped: [...saved.skipped.filter((t) => t !== token), token],
  }));
}

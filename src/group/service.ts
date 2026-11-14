import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { findCurrency } from "../currency/currencies";
import { groups, members } from "../db/schema";
import type { Db } from "../db/types";
import { LIMITS } from "./limits";

// The group service: the one seam the pages call. Every command either
// returns the updated group view or a refusal reason, and a refusal changes nothing.

export type MemberView = {
  id: string;
  name: string;
  active: boolean;
  version: number;
};

export type GroupView = {
  linkToken: string;
  name: string;
  currency: string;
  digits: number;
  version: number;
  /** In creation order. */
  members: MemberView[];
};

export type CommandResult<Reason extends string> =
  { ok: true; view: GroupView } | { ok: false; reason: Reason };

export type CreateGroupRefusal =
  | "group-name-missing"
  | "group-name-too-long"
  | "currency-unknown"
  | "members-missing"
  | "member-name-missing"
  | "member-name-too-long"
  | "member-name-duplicate"
  | "too-many-members";

export async function createGroup(
  db: Db,
  input: { name: string; currency: string; memberNames: string[] }
): Promise<CommandResult<CreateGroupRefusal>> {
  const name = cleanName(input.name);
  if (name === "") return refuse("group-name-missing");
  if (name.length > LIMITS.groupNameLength)
    return refuse("group-name-too-long");
  if (!findCurrency(input.currency)) return refuse("currency-unknown");

  const memberNames = input.memberNames.map(cleanName);
  if (memberNames.length === 0) return refuse("members-missing");
  if (memberNames.length > LIMITS.members) return refuse("too-many-members");
  if (memberNames.some((n) => n === "")) return refuse("member-name-missing");
  if (memberNames.some((n) => n.length > LIMITS.memberNameLength)) {
    return refuse("member-name-too-long");
  }
  if (new Set(memberNames.map(nameKey)).size !== memberNames.length) {
    return refuse("member-name-duplicate");
  }

  const linkToken = newLinkToken();
  try {
    await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ linkToken, name, currency: input.currency })
        .returning({ id: groups.id });
      await tx.insert(members).values(
        memberNames.map((memberName, position) => ({
          groupId: group.id,
          name: memberName,
          position,
        }))
      );
    });
  } catch (error) {
    // The database's name index folds case by its own collation; if it ever
    // catches a duplicate the check above passed, it's still a refusal.
    if (violates(error, "members_group_name_unique")) {
      return refuse("member-name-duplicate");
    }
    throw error;
  }

  const view = await readGroupView(db, linkToken);
  if (!view) throw new Error("A group just created could not be read back.");
  return { ok: true, view };
}

/** Whether a group has this link: one indexed lookup, for checks that run before a page renders. */
export async function hasGroup(db: Db, linkToken: string): Promise<boolean> {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.linkToken, linkToken))
    .limit(1);
  return group !== undefined;
}

/** The group a link opens, or undefined when no group has that link. */
export async function readGroupView(
  db: Db,
  linkToken: string
): Promise<GroupView | undefined> {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.linkToken, linkToken));
  if (!group) return undefined;

  const memberRows = await db
    .select({
      id: members.id,
      name: members.name,
      active: members.active,
      version: members.version,
    })
    .from(members)
    .where(eq(members.groupId, group.id))
    .orderBy(asc(members.position));

  const currency = findCurrency(group.currency);
  if (!currency)
    throw new Error(
      `Group has a currency outside the table: ${group.currency}`
    );

  return {
    linkToken: group.linkToken,
    name: group.name,
    currency: currency.code,
    digits: currency.digits,
    version: group.version,
    members: memberRows,
  };
}

function refuse<Reason extends string>(
  reason: Reason
): { ok: false; reason: Reason } {
  return { ok: false, reason };
}

/** Whether a write failed on the named unique constraint or index. Drizzle wraps the driver's error. */
function violates(error: unknown, constraint: string): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ("constraint" in e && e.constraint === constraint) return true;
  }
  return false;
}

/** Names are stored trimmed and in Unicode NFC, so "é" typed two ways is one name. */
function cleanName(name: string): string {
  return name.trim().normalize("NFC");
}

/**
 * Member names are compared ignoring case and surrounding spaces. The
 * database's unique index is only a backstop: its lower() follows the
 * database collation and may not fold non-ASCII letters.
 */
function nameKey(cleanedName: string): string {
  return cleanedName.toLowerCase();
}

/** 128 random bits, URL-safe: the group's only credential. */
function newLinkToken(): string {
  return randomBytes(16).toString("base64url");
}

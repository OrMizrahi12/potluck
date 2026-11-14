import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { findCurrency, type Currency } from "../currency/currencies";
import {
  expenseParticipants,
  expenses,
  groups,
  members,
  settlements,
} from "../db/schema";
import type { Db } from "../db/types";
import { parseAmount } from "../money/amount";
import {
  computeGroupMoney,
  type Share,
  type SuggestedSettlement,
} from "../money/group-money";
import { LIMITS } from "./limits";

// The group service: the one seam the pages call. Every command either
// returns the updated group view or a refusal reason, and a refusal changes nothing.

export type MemberView = {
  id: string;
  name: string;
  active: boolean;
  version: number;
  /** Minor units: positive when the group owes the member, negative when they owe the group. */
  balance: number;
};

export type ExpenseView = {
  /** Assigned at creation and never changed. */
  id: string;
  description: string;
  /** Minor units. */
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
  payerId: string;
  version: number;
  /** Every participant's share, in member creation order; `extra` marks a leftover unit. */
  shares: Share[];
};

export type GroupView = {
  linkToken: string;
  name: string;
  currency: string;
  digits: number;
  version: number;
  /** In creation order. */
  members: MemberView[];
  /** Newest first: the most recent `expenseLimit` of them. */
  expenses: ExpenseView[];
  /** Whether older expenses exist beyond `expenses`. */
  hasOlderExpenses: boolean;
  /** Newest first. */
  settlements: SettlementView[];
  /**
   * Settlements that would leave every member settled up, recomputed on every
   * read and never stored. Empty when everyone is settled up.
   */
  suggestedSettlements: SuggestedSettlement[];
};

export type SettlementView = {
  id: string;
  /** The member who paid. */
  fromId: string;
  /** The member who was paid. */
  toId: string;
  /** Minor units. */
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
  version: number;
};

/** How many expenses a group view shows unless asked for more. */
export const EXPENSE_PAGE_SIZE = 20;

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

/**
 * Whether a group has this link: one indexed lookup, for checks that run before
 * a page renders. A link newLinkToken() couldn't have made is answered without
 * the database, so guessed links don't wake it.
 */
export async function hasGroup(db: Db, linkToken: string): Promise<boolean> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return false;
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.linkToken, linkToken))
    .limit(1);
  return group !== undefined;
}

/** Why an expense's description, amount, date, payer or participants can't be recorded. */
export type ExpenseRefusal =
  | "description-missing"
  | "description-too-long"
  | "amount-unreadable"
  | "amount-not-positive"
  | "amount-too-large"
  | "date-unreadable"
  | "payer-unknown"
  | "participant-unknown"
  | "participants-only-payer"
  | "amount-too-small-to-split";

export type AddExpenseRefusal =
  "group-unknown" | ExpenseRefusal | "too-many-expenses";

export type AddExpenseInput = {
  description: string;
  /** As typed, in the group's currency: "12.34", or "1234" for yen. */
  amount: string;
  /** YYYY-MM-DD. */
  date: string;
  payerId: string;
  participantIds: string[];
};

/**
 * Records an expense, split equally among its participants. The payer is a
 * participant only if listed among them.
 */
export async function addExpense(
  db: Db,
  linkToken: string,
  input: AddExpenseInput
): Promise<CommandResult<AddExpenseRefusal>> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return refuse("group-unknown");

  const refusal = await db.transaction(async (tx) => {
    const group = await lockGroup(tx, linkToken);
    if (!group) return "group-unknown" as const;
    const expense = await checkExpense(tx, group, input);
    if (typeof expense === "string") return expense;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(eq(expenses.groupId, group.id));
    if (count >= LIMITS.expenses) return "too-many-expenses" as const;

    const { participantIds, ...fields } = expense;
    const [added] = await tx
      .insert(expenses)
      .values({ groupId: group.id, ...fields })
      .returning({ id: expenses.id });
    await tx
      .insert(expenseParticipants)
      .values(
        participantIds.map((memberId) => ({ expenseId: added.id, memberId }))
      );
    return undefined;
  });
  if (refusal) return refuse(refusal);
  return { ok: true, view: await readWrittenGroup(db, linkToken) };
}

export type EditExpenseRefusal =
  "group-unknown" | "expense-unknown" | "stale-version" | ExpenseRefusal;

export type EditExpenseInput = AddExpenseInput & {
  expenseId: string;
  /** The expense's version the edit was made from. */
  version: number;
};

/**
 * Replaces an expense's description, amount, date, payer and participants,
 * under the same rules as adding it. Its id never changes, so the odd-cent
 * rule may hand a leftover unit to a participant the edit didn't touch.
 * Refused as stale when the expense has changed since `version`, so nobody
 * overwrites a change they haven't seen.
 */
export async function editExpense(
  db: Db,
  linkToken: string,
  input: EditExpenseInput
): Promise<CommandResult<EditExpenseRefusal>> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return refuse("group-unknown");
  if (!UUID_SHAPE.test(input.expenseId)) return refuse("expense-unknown");

  const refusal = await db.transaction(async (tx) => {
    const group = await lockGroup(tx, linkToken);
    if (!group) return "group-unknown" as const;
    const stored = await storedVersion(tx, expenses, group.id, input.expenseId);
    if (stored === undefined) return "expense-unknown" as const;
    if (stored !== input.version) return "stale-version" as const;
    const expense = await checkExpense(tx, group, input);
    if (typeof expense === "string") return expense;

    const { participantIds, ...fields } = expense;
    await tx
      .update(expenses)
      .set({ ...fields, version: input.version + 1 })
      .where(eq(expenses.id, input.expenseId));
    await tx
      .delete(expenseParticipants)
      .where(eq(expenseParticipants.expenseId, input.expenseId));
    await tx.insert(expenseParticipants).values(
      participantIds.map((memberId) => ({
        expenseId: input.expenseId,
        memberId,
      }))
    );
    return undefined;
  });
  if (refusal) return refuse(refusal);
  return { ok: true, view: await readWrittenGroup(db, linkToken) };
}

export type DeleteExpenseRefusal =
  "group-unknown" | "expense-unknown" | "stale-version";

/**
 * Deletes an expense for good, with its participants: there's no undo.
 * Refused as stale when the expense has changed since `version`.
 */
export async function deleteExpense(
  db: Db,
  linkToken: string,
  input: { expenseId: string; version: number }
): Promise<CommandResult<DeleteExpenseRefusal>> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return refuse("group-unknown");
  if (!UUID_SHAPE.test(input.expenseId)) return refuse("expense-unknown");

  const refusal = await db.transaction(async (tx) => {
    const group = await lockGroup(tx, linkToken);
    if (!group) return "group-unknown" as const;
    const stored = await storedVersion(tx, expenses, group.id, input.expenseId);
    if (stored === undefined) return "expense-unknown" as const;
    if (stored !== input.version) return "stale-version" as const;

    // Its participants go with it: their foreign key cascades.
    await tx.delete(expenses).where(eq(expenses.id, input.expenseId));
    return undefined;
  });
  if (refusal) return refuse(refusal);
  return { ok: true, view: await readWrittenGroup(db, linkToken) };
}

/**
 * Locks a group's row for the rest of the transaction, which serializes its
 * writers: two expenses added at once can't both slip under the cap.
 */
async function lockGroup(
  tx: Db,
  linkToken: string
): Promise<{ id: string; currency: string } | undefined> {
  const [group] = await tx
    .select({ id: groups.id, currency: groups.currency })
    .from(groups)
    .where(eq(groups.linkToken, linkToken))
    .for("update");
  return group;
}

/**
 * The stored version of the group's expense or settlement with this id, or
 * undefined when the group has none. Call it with the group locked (see
 * lockGroup), so the version can't change before the write that checks it.
 */
async function storedVersion(
  tx: Db,
  table: typeof expenses | typeof settlements,
  groupId: string,
  id: string
): Promise<number | undefined> {
  const [row] = await tx
    .select({ version: table.version })
    .from(table)
    .where(and(eq(table.id, id), eq(table.groupId, groupId)));
  return row?.version;
}

/** An expense as it will be stored, or why the group's rules refuse it. */
async function checkExpense(
  tx: Db,
  group: { id: string; currency: string },
  input: AddExpenseInput
): Promise<
  | {
      description: string;
      amount: number;
      date: string;
      payerId: string;
      participantIds: string[];
    }
  | ExpenseRefusal
> {
  const description = cleanName(input.description);
  if (description === "") return "description-missing";
  if (description.length > LIMITS.descriptionLength)
    return "description-too-long";
  if (!isCalendarDate(input.date)) return "date-unreadable";

  const amount = readAmount(input.amount, currencyOf(group.currency).digits);
  if (typeof amount === "string") return amount;

  const memberIds = await memberIdsOf(tx, group.id);
  if (!memberIds.has(input.payerId)) return "payer-unknown";
  const participantIds = [...new Set(input.participantIds)];
  if (participantIds.some((id) => !memberIds.has(id)))
    return "participant-unknown";
  if (!participantIds.some((id) => id !== input.payerId))
    return "participants-only-payer";
  if (amount < participantIds.length) return "amount-too-small-to-split";

  return {
    description,
    amount,
    date: input.date,
    payerId: input.payerId,
    participantIds,
  };
}

async function memberIdsOf(tx: Db, groupId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.groupId, groupId));
  return new Set(rows.map((m) => m.id));
}

/** The group view right after a write that succeeded. */
async function readWrittenGroup(db: Db, linkToken: string): Promise<GroupView> {
  const view = await readGroupView(db, linkToken);
  if (!view) throw new Error("A group just written could not be read back.");
  return view;
}

export type AddSettlementRefusal =
  | "group-unknown"
  | "amount-unreadable"
  | "amount-not-positive"
  | "amount-too-large"
  | "date-unreadable"
  | "from-unknown"
  | "to-unknown"
  | "settlement-to-self"
  | "too-many-settlements";

export type AddSettlementInput = {
  /** The member who paid. */
  fromId: string;
  /** The member who was paid. */
  toId: string;
  /** As typed, in the group's currency. */
  amount: string;
  /** YYYY-MM-DD. */
  date: string;
};

/**
 * Records that one member paid another outside Potluck. Any positive amount
 * up to the cap is accepted, whatever it does to balances: a partial payment,
 * an overpayment, or a loan from lender to borrower.
 */
export async function addSettlement(
  db: Db,
  linkToken: string,
  input: AddSettlementInput
): Promise<CommandResult<AddSettlementRefusal>> {
  if (!LINK_TOKEN_SHAPE.test(linkToken)) return refuse("group-unknown");
  if (input.fromId === input.toId) return refuse("settlement-to-self");
  if (!isCalendarDate(input.date)) return refuse("date-unreadable");

  const refusal = await db.transaction(async (tx) => {
    // Locking the group row serializes its writers (see addExpense).
    const [group] = await tx
      .select({ id: groups.id, currency: groups.currency })
      .from(groups)
      .where(eq(groups.linkToken, linkToken))
      .for("update");
    if (!group) return "group-unknown" as const;

    const amount = readAmount(input.amount, currencyOf(group.currency).digits);
    if (typeof amount === "string") return amount;

    const memberIds = new Set(
      (
        await tx
          .select({ id: members.id })
          .from(members)
          .where(eq(members.groupId, group.id))
      ).map((m) => m.id)
    );
    if (!memberIds.has(input.fromId)) return "from-unknown" as const;
    if (!memberIds.has(input.toId)) return "to-unknown" as const;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(settlements)
      .where(eq(settlements.groupId, group.id));
    if (count >= LIMITS.settlements) return "too-many-settlements" as const;

    await tx.insert(settlements).values({
      groupId: group.id,
      fromId: input.fromId,
      toId: input.toId,
      amount,
      date: input.date,
    });
    return undefined;
  });
  if (refusal) return refuse(refusal);

  const view = await readGroupView(db, linkToken);
  if (!view) throw new Error("A group just written could not be read back.");
  return { ok: true, view };
}

/** The group a link opens, or undefined when no group has that link. */
export async function readGroupView(
  db: Db,
  linkToken: string,
  { expenseLimit = EXPENSE_PAGE_SIZE }: { expenseLimit?: number } = {}
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

  // Balances need every expense, so all are read; the view shows a page.
  const expenseRows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      payerId: expenses.payerId,
      version: expenses.version,
    })
    .from(expenses)
    .where(eq(expenses.groupId, group.id))
    .orderBy(desc(expenses.date), desc(expenses.createdAt), desc(expenses.id));
  const participantRows = await db
    .select({
      expenseId: expenseParticipants.expenseId,
      memberId: expenseParticipants.memberId,
    })
    .from(expenseParticipants)
    .innerJoin(expenses, eq(expenses.id, expenseParticipants.expenseId))
    .where(eq(expenses.groupId, group.id));
  const participantIdsByExpense = new Map<string, string[]>();
  for (const { expenseId, memberId } of participantRows) {
    const ids = participantIdsByExpense.get(expenseId) ?? [];
    ids.push(memberId);
    participantIdsByExpense.set(expenseId, ids);
  }

  const settlementRows = await db
    .select({
      id: settlements.id,
      fromId: settlements.fromId,
      toId: settlements.toId,
      amount: settlements.amount,
      date: settlements.date,
      version: settlements.version,
    })
    .from(settlements)
    .where(eq(settlements.groupId, group.id))
    .orderBy(
      desc(settlements.date),
      desc(settlements.createdAt),
      desc(settlements.id)
    );

  const money = computeGroupMoney({
    members: memberRows,
    expenses: expenseRows.map((e) => ({
      id: e.id,
      amount: e.amount,
      payerId: e.payerId,
      participantIds: participantIdsByExpense.get(e.id) ?? [],
    })),
    settlements: settlementRows,
  });
  const balanceById = new Map(
    money.balances.map((b) => [b.memberId, b.balance])
  );

  const currency = currencyOf(group.currency);
  return {
    linkToken: group.linkToken,
    name: group.name,
    currency: currency.code,
    digits: currency.digits,
    version: group.version,
    members: memberRows.map((m) => ({
      ...m,
      balance: balanceById.get(m.id) ?? 0,
    })),
    expenses: expenseRows.slice(0, expenseLimit).map((e) => ({
      ...e,
      shares: money.shares.get(e.id) ?? [],
    })),
    hasOlderExpenses: expenseRows.length > expenseLimit,
    settlements: settlementRows,
    suggestedSettlements: money.suggestedSettlements,
  };
}

function currencyOf(code: string): Currency {
  const currency = findCurrency(code);
  if (!currency)
    throw new Error(`Group has a currency outside the table: ${code}`);
  return currency;
}

/**
 * Typed amount text in minor units, or why it can't be an expense's or a
 * settlement's amount: at least 1 minor unit and at most the cap.
 */
function readAmount(
  text: string,
  digits: number
): number | "amount-unreadable" | "amount-not-positive" | "amount-too-large" {
  const amount = parseAmount(text, digits);
  if (amount === undefined) return "amount-unreadable";
  if (amount <= 0) return "amount-not-positive";
  if (amount > LIMITS.amountMajorUnits * 10 ** digits)
    return "amount-too-large";
  return amount;
}

/** Whether text is a real calendar date written YYYY-MM-DD. */
function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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

/** A UUID's text: what the database assigns as expense and settlement ids. */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What newLinkToken() makes: 16 bytes in unpadded base64url. */
const LINK_TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

/** 128 random bits, URL-safe: the group's only credential. */
function newLinkToken(): string {
  return randomBytes(16).toString("base64url");
}

import {
  addExpense,
  addSettlement,
  createGroup,
  deleteGroup,
  readGroupView,
  setMemberActive,
  type CommandResult,
  type GroupView,
} from "../group/service";
import { appInfo } from "./schema";
import type { Db } from "./types";

/**
 * The links the seeded groups open at, the same on every run. They are public,
 * which is safe only because production is never seeded.
 */
export const SEED_LINKS = {
  flatShare: "seed-flat-share-eur-01",
} as const;

/**
 * Loads the fake data for local and `development` databases; the only source
 * of data there. Production is never seeded.
 *
 * Every seeded group is written through the group service, so its rules hold,
 * and is deleted and written again on each run, so re-running gives the same
 * data. Amounts divide evenly among their participants: the odd-cent rule
 * hashes expense ids, which are new on every run, so a leftover unit could
 * land on a different member each time.
 */
export async function seed(db: Db): Promise<void> {
  await db
    .insert(appInfo)
    .values({ greeting: "Potluck is connected to its database." })
    .onConflictDoNothing();

  await seedFlatShare(db);
}

/** An inactive member who still owes the group, and a payer who isn't a participant. */
async function seedFlatShare(db: Db) {
  const group = await recreate(db, SEED_LINKS.flatShare, {
    name: "Flat share",
    currency: "EUR",
    memberNames: ["Ana", "Ben", "Cai", "Dee"],
  });
  const [ana, ben, cai, dee] = group.members.map((m) => m.id);
  const everyone = [ana, ben, cai, dee];

  const link = SEED_LINKS.flatShare;
  for (const expense of [
    {
      description: "Rent",
      amount: "2400.00",
      date: "2026-10-01",
      payerId: ana,
      participantIds: everyone,
    },
    {
      description: "Electricity",
      amount: "88.00",
      date: "2026-10-03",
      payerId: ben,
      participantIds: everyone,
    },
    {
      description: "Groceries",
      amount: "64.20",
      date: "2026-10-05",
      payerId: dee,
      participantIds: everyone,
    },
    {
      description: "Concert ticket for Dee",
      amount: "45.00",
      date: "2026-10-08",
      payerId: ben,
      participantIds: [dee],
    },
  ]) {
    written(await addExpense(db, link, expense));
  }
  written(
    await addSettlement(db, link, {
      fromId: ben,
      toId: ana,
      amount: "505.05",
      date: "2026-10-20",
    })
  );
  written(
    await addSettlement(db, link, {
      fromId: cai,
      toId: ana,
      amount: "638.05",
      date: "2026-10-21",
    })
  );
  written(
    await setMemberActive(db, link, {
      memberId: dee,
      version: 1,
      active: false,
    })
  );
}

/** Deletes the group at `link`, if there is one, and creates it afresh there. */
async function recreate(
  db: Db,
  link: string,
  input: Parameters<typeof createGroup>[1]
): Promise<GroupView> {
  const old = await readGroupView(db, link);
  if (old) {
    const deleted = await deleteGroup(db, link, { version: old.version });
    if (!deleted.ok) throw new Error(`Seed refused: ${deleted.reason}`);
  }
  return written(await createGroup(db, input, { linkToken: link }));
}

/** The view a seed command wrote; a refusal means the seed broke a rule. */
function written<Reason extends string>(
  result: CommandResult<Reason>
): GroupView {
  if (!result.ok) throw new Error(`Seed refused: ${result.reason}`);
  return result.view;
}

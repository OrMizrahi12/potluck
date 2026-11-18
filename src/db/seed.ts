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
import { LIMITS } from "../group/limits";
import type { Db } from "./types";

/**
 * The links the seeded groups open at, the same on every run. They are public,
 * which is safe only because production is never seeded.
 */
export const SEED_LINKS = {
  flatShare: "seed-flat-share-eur-01",
  skiCabin: "seed-ski-cabin-usd-001",
  yenGroup: "seed-tokyo-trip-jpy-01",
  dinarGroup: "seed-conference-bhd-01",
  fullGroup: "seed-reunion-50-member",
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
  await seedFlatShare(db);
  await seedSkiCabin(db);
  await seedYenGroup(db);
  await seedDinarGroup(db);
  await seedFullGroup(db);
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

/**
 * Settlements smaller and larger than the balance, and a loan from the member
 * who lent to the member who borrowed.
 */
async function seedSkiCabin(db: Db) {
  const link = SEED_LINKS.skiCabin;
  const group = await recreate(db, link, {
    name: "Ski cabin",
    currency: "USD",
    memberNames: ["Eva", "Finn", "Gal", "Hana"],
  });
  const [eva, finn, gal, hana] = group.members.map((m) => m.id);

  written(
    await addExpense(db, link, {
      description: "Cabin",
      amount: "1200.00",
      date: "2026-12-01",
      payerId: eva,
      participantIds: [eva, finn, gal, hana],
    })
  );
  for (const settlement of [
    // Finn pays what he owes in parts, and isn't done yet.
    { fromId: finn, toId: eva, amount: "100.00", date: "2026-12-02" },
    { fromId: finn, toId: eva, amount: "150.00", date: "2026-12-05" },
    // Gal pays 100.00 more than she owes.
    { fromId: gal, toId: eva, amount: "400.00", date: "2026-12-06" },
    // A loan: Hana lends Finn 200.00.
    { fromId: hana, toId: finn, amount: "200.00", date: "2026-12-08" },
  ]) {
    written(await addSettlement(db, link, settlement));
  }
}

/** A group in yen, which has no minor units. */
async function seedYenGroup(db: Db) {
  const link = SEED_LINKS.yenGroup;
  const group = await recreate(db, link, {
    name: "Tokyo trip",
    currency: "JPY",
    memberNames: ["Ana", "Kenji", "Yui"],
  });
  const [ana, kenji, yui] = group.members.map((m) => m.id);

  for (const expense of [
    { description: "Hotel", amount: "90000", date: "2026-09-10", payerId: ana },
    {
      description: "Ramen",
      amount: "3600",
      date: "2026-09-11",
      payerId: kenji,
    },
  ]) {
    written(
      await addExpense(db, link, {
        ...expense,
        participantIds: [ana, kenji, yui],
      })
    );
  }
  written(
    await addSettlement(db, link, {
      fromId: yui,
      toId: ana,
      amount: "30000",
      date: "2026-09-15",
    })
  );
}

/** A group in Bahraini dinars, which have three decimals. */
async function seedDinarGroup(db: Db) {
  const link = SEED_LINKS.dinarGroup;
  const group = await recreate(db, link, {
    name: "Manama conference",
    currency: "BHD",
    memberNames: ["Ali", "Sara", "Omar"],
  });
  const [ali, sara, omar] = group.members.map((m) => m.id);

  for (const expense of [
    {
      description: "Taxi",
      amount: "10.500",
      date: "2026-11-02",
      payerId: ali,
      participantIds: [ali, sara, omar],
    },
    {
      description: "Lunch",
      amount: "4.250",
      date: "2026-11-03",
      payerId: sara,
      participantIds: [sara, omar],
    },
  ]) {
    written(await addExpense(db, link, expense));
  }
}

/** A group with as many members as a group can have. */
async function seedFullGroup(db: Db) {
  const link = SEED_LINKS.fullGroup;
  const group = await recreate(db, link, {
    name: "Family reunion",
    currency: "GBP",
    memberNames: Array.from(
      { length: LIMITS.members },
      (_, i) => `Guest ${i + 1}`
    ),
  });
  const everyone = group.members.map((m) => m.id);

  written(
    await addExpense(db, link, {
      description: "Hall hire",
      amount: "500.00",
      date: "2026-08-15",
      payerId: everyone[0],
      participantIds: everyone,
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

// The group service's caps. Pure data, so forms can import them for hints;
// the service enforces them.
export const LIMITS = {
  groupNameLength: 100,
  memberNameLength: 50,
  members: 50,
  /** An expense's description. */
  descriptionLength: 100,
  expenses: 5000,
  /** The largest expense, in major units of the group's currency. */
  amountMajorUnits: 10_000_000,
} as const;

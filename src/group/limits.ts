// The group service's caps. Pure data, so forms can import them for hints;
// the service enforces them.
export const LIMITS = {
  groupNameLength: 100,
  memberNameLength: 50,
  members: 50,
} as const;

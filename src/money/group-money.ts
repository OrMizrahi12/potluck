export type GroupMoneyInput = {
  members: { id: string }[];
  expenses: {
    id: string;
    amount: number;
    payerId: string;
    participantIds: string[];
  }[];
  settlements: { fromId: string; toId: string; amount: number }[];
};

export type Share = { memberId: string; share: number; extra: 0 | 1 };

export type Balance = { memberId: string; balance: number };

export type GroupMoney = {
  shares: Map<string, Share[]>;
  balances: Balance[];
};

export function computeGroupMoney(input: GroupMoneyInput): GroupMoney {
  const shares = new Map<string, Share[]>();
  for (const expense of input.expenses) {
    const participating = new Set(expense.participantIds);
    const participantIds = input.members
      .map((m) => m.id)
      .filter((id) => participating.has(id));
    const n = participantIds.length;
    const base = Math.floor(expense.amount / n);
    const leftover = expense.amount % n;
    const offset = fnv1a32(expense.id) % n;
    const expenseShares: Share[] = participantIds.map((memberId) => ({
      memberId,
      share: base,
      extra: 0,
    }));
    for (let i = 0; i < leftover; i++) {
      const s = expenseShares[(offset + i) % n];
      s.share += 1;
      s.extra = 1;
    }
    shares.set(expense.id, expenseShares);
  }
  const net = new Map(input.members.map((m) => [m.id, 0]));
  const add = (memberId: string, amount: number) =>
    net.set(memberId, (net.get(memberId) ?? 0) + amount);
  for (const expense of input.expenses) {
    add(expense.payerId, expense.amount);
    for (const s of shares.get(expense.id) ?? []) add(s.memberId, -s.share);
  }
  for (const settlement of input.settlements) {
    add(settlement.fromId, settlement.amount);
    add(settlement.toId, -settlement.amount);
  }
  const balances = input.members.map((m) => ({
    memberId: m.id,
    balance: net.get(m.id) ?? 0,
  }));

  return { shares, balances };
}

// 32-bit FNV-1a over the id's UTF-16 code units (ids are ASCII, so these are its bytes).
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

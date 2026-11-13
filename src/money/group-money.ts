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

export type SuggestedSettlement = {
  fromId: string;
  toId: string;
  amount: number;
};

export type GroupMoney = {
  shares: Map<string, Share[]>;
  balances: Balance[];
  suggestedSettlements: SuggestedSettlement[];
};

export function computeGroupMoney(input: GroupMoneyInput): GroupMoney {
  const shares = new Map<string, Share[]>();
  const balanceById = new Map(input.members.map((m) => [m.id, 0]));
  const add = (memberId: string, amount: number) =>
    balanceById.set(memberId, (balanceById.get(memberId) ?? 0) + amount);
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
    add(expense.payerId, expense.amount);
    for (const s of expenseShares) add(s.memberId, -s.share);
  }
  for (const settlement of input.settlements) {
    add(settlement.fromId, settlement.amount);
    add(settlement.toId, -settlement.amount);
  }
  const balances = input.members.map((m) => ({
    memberId: m.id,
    balance: balanceById.get(m.id) ?? 0,
  }));

  return { shares, balances, suggestedSettlements: suggest(balances) };
}

// Greedy matching: repeatedly match the largest debtor with the largest
// creditor for the smaller of the two amounts. Ties go to the earlier-created
// member (balances arrive in creation order), so the result is deterministic.
function suggest(balances: Balance[]): SuggestedSettlement[] {
  const open = balances.map((b, order) => ({ ...b, order }));
  const largest = (sign: 1 | -1) =>
    open
      .filter((b) => Math.sign(b.balance) === sign)
      .sort((x, y) => sign * (y.balance - x.balance) || x.order - y.order)[0];

  const out: SuggestedSettlement[] = [];
  for (;;) {
    const creditor = largest(1);
    const debtor = largest(-1);
    if (!creditor || !debtor) return out;
    const amount = Math.min(creditor.balance, -debtor.balance);
    out.push({ fromId: debtor.memberId, toId: creditor.memberId, amount });
    creditor.balance -= amount;
    debtor.balance += amount;
  }
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

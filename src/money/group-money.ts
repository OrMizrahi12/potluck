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

export type GroupMoney = {
  shares: Map<string, Share[]>;
};

export function computeGroupMoney(input: GroupMoneyInput): GroupMoney {
  const shares = new Map<string, Share[]>();
  for (const expense of input.expenses) {
    const share = expense.amount / expense.participantIds.length;
    shares.set(
      expense.id,
      expense.participantIds.map((memberId) => ({ memberId, share, extra: 0 }))
    );
  }
  return { shares };
}

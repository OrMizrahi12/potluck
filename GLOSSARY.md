# Potluck

Potluck tracks money shared within a group: who paid for what, and what each member must pay or receive to come out even.

## People

**Group**:
A set of members who track shared expenses together, in a single currency.
_Avoid_: Party, event, trip, household

**Member**:
A named person within one group. A member is not an account and exists only inside its group; an inactive member is kept for history but left out of new expenses by default.
_Avoid_: User, person, friend, account

## Money

**Expense**:
Money one member paid on the group's behalf, to be split among chosen participants. A settlement is never an expense.
_Avoid_: Bill, purchase, cost, transaction

**Payer**:
The member who paid for an expense.
_Avoid_: Spender, buyer, creditor

**Participant**:
A member an expense is split among. The payer is a participant only when they're included in the split.
_Avoid_: Debtor, beneficiary

**Share**:
The portion of one expense that one participant is responsible for.
_Avoid_: Split (as a noun), portion, cut

**Balance**:
One member's net position in the group: what they paid for expenses plus settlements they made, minus their shares and settlements they received. Positive means the group owes them; negative means they owe the group; a group's balances always sum to zero.
_Avoid_: Debt, net, total

**Settlement**:
A record that one member paid another member an amount outside Potluck, to bring their balances toward zero. "Settle up" is the verb.
_Avoid_: Payment, repayment, transfer

**Suggested settlement**:
A settlement Potluck proposes, but nobody has recorded yet, as part of the smallest set that would bring every balance to zero. Recording it makes it a settlement.
_Avoid_: Transfer, repayment, who owes whom

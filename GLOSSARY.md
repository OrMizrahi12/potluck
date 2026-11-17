# Potluck

Potluck tracks money shared within a group: who paid for what, and what each member must pay or receive to come out even.

## People

**Group**:
A set of members who share expenses, keeping their balances in one group currency.
_Avoid_: Party, event, trip, household

**Group currency**:
The one currency a group's balances, shares and settlements are in.
_Avoid_: Base currency, home currency, default currency

**Group link**:
The address that opens one group; anyone who has it can open the group, and it is the only way in.
_Avoid_: Invite, share link, token (for the whole address)

**Member**:
A named person within one group.
_Avoid_: User, person, friend, account

**Inactive member**:
A member who isn't pre-selected as a participant in new expenses.
_Avoid_: Removed, former, archived member

## Money

**Expense**:
Money one member paid on the group's behalf, split among chosen participants.
_Avoid_: Bill, purchase, cost, transaction

**Payer**:
The member who paid for an expense.
_Avoid_: Spender, buyer, creditor

**Participant**:
A member an expense is split among.
_Avoid_: Debtor, beneficiary

**Share**:
The portion of one expense that one participant is responsible for.
_Avoid_: Split (as a noun), portion, cut

**Balance**:
One member's position in the group: positive when the group owes them, negative when they owe the group.
_Avoid_: Debt, net, total

**Settlement**:
A record that one member paid another member outside Potluck.
_Avoid_: Payment, repayment, transfer

**Suggested settlement**:
A settlement Potluck proposes that nobody has recorded yet.
_Avoid_: Transfer, repayment, who owes whom

**Foreign amount**:
An expense's or settlement's amount as paid, in a currency other than the group currency.
_Avoid_: Original amount, source amount

**Exchange rate**:
How many units of the group currency one unit of a foreign amount's currency was worth, for the expense or settlement it belongs to.
_Avoid_: Conversion rate, FX rate

**Settled up**:
The state of a member whose balance is zero.
_Avoid_: Even, square, paid off, settled (as a verb)

## Running Potluck

**Independent**:
Potluck runs, deploys, restores, rolls back and reports its own breakage without the operator's own machine, from its own database and secrets.
_Avoid_: Self-hosted, autonomous, unattended

**Deploy**:
A build of `main` running on production's database, reachable at its own address but not yet at the production address.
_Avoid_: Ship, push, publish

**Smoke test**:
A check run against a deploy, without writing to production data, that must pass before it's released.
_Avoid_: Sanity check, health check (for this step)

**Release**:
The production address moving to a deploy.
_Avoid_: Deploy (for this step), go live, promote

**Rollback**:
A person moving the production address back to the previous release; the database schema stays as it is.
_Avoid_: Revert, undo, restore

**Backup**:
An encrypted copy of production data, kept outside the database so the data can be restored if the database is lost.
_Avoid_: Snapshot, dump, history

**Restore**:
Overwriting production data with an earlier state, whether from the database's own history or from a backup.
_Avoid_: Rollback, recover, undo

**Launch**:
The first time the production address reaches anyone outside the repo.
_Avoid_: Go-live, release, soft launch

**Incident**:
Production failing its users, from the alert until the fix is released and a short note about it is written.
_Avoid_: Outage, downtime, bug

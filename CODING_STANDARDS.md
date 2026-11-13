# Coding standards

Rules this codebase follows that no tool checks. Prettier, ESLint and `tsc` enforce formatting, lint and types (`npm run check`), so those aren't repeated here.

## Words

`npm run lint` rejects declared names and test names that use a word from a `GLOSSARY.md` _Avoid_ list. The rules below cover what it can't see.

- Comments use the glossary's terms too, even when they paraphrase the spec or an outside source that uses an avoided word.
- When the glossary has no term for something, write a plain phrase from glossary words rather than borrowing a synonym: "the member who owes most", not "debtor".
- Names taken from the spec's own code keep the spec's spelling, so code and spec read side by side: `share`, `extra`, `n`, `q`, `r`. The glossary still wins: the spec's `debt` becomes a glossary phrase.

## Types

- Ids are plain `string` and amounts plain `number`. The group service guarantees what they hold, and the engine lists that among its preconditions.
- A suggested settlement keeps its own type, even where its fields match a recorded settlement's: one is a proposal, the other a record.

## Money

- Amounts are integers in minor units. No floats anywhere in money arithmetic.
- Shares of an expense always add up exactly to its amount; the leftover units are handed out by the odd-cent rule, never rounded away.

## Pure functions and preconditions

- Money logic lives in pure functions under `src/money/`: data in, data out, no I/O.
- Validation belongs to the group service. A pure function doesn't re-check what the service refuses; it lists those preconditions in a doc comment on the function instead, and its tests don't feed it invalid input.

## Determinism

- Whenever order matters, use member creation order, and break ties in favour of the earlier-created member.
- No randomness and no stored cursors: the same input always gives the same output.
- Key per-member and per-expense data by id in a `Map`, not a plain object.

## Tests

- Test through the module's public function, and assert on what a caller can observe, never on internals.
- `describe` names the domain thing; each `it` completes the sentence in plain words: `describe("balances")` → `it("sum to zero")`.
- Expected values come from published test vectors or the spec's examples, worked by hand, never from running the code. When the derivation isn't obvious, show it in a comment above the test.
- Each test spells out its own input as literals, even when that repeats another test's setup.

## Commits

- One behaviour per commit, so each commit's tests describe one step.
- The subject says what the change does, in plain words and the imperative ("Count settlements in balances"); the body says why.

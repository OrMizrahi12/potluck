# Odd-cent rounding in equal splits

Researched 2026-11-11. Who gets the leftover minor unit(s) of an equal split, and where do a currency's minor units come from?

## Answer

Every source gives each share `floor(amount / n)`, then hands the `amount mod n` leftover units out one each. They differ only in who gets them:

- **First k in list order.** Ruby `money` ([1]), Dinero.js ([2]). In a library, list order is the caller's order.
- **Rotating start, seeded by the expense id.** Spliit ([3]): largest remainder, with equal-split ties broken by an offset of `hash(expense.id) mod n`.
- **"Random", meant to be fair over time.** Splitwise, per a 2018 admin forum reply ([4]); no current official docs found.
- **Not documented.** Tricount says one participant gets 33.34 € of 100 € / 3, not which one ([5]). No primary source found for Settle Up.
- **No integer shares at all.** IHateMoney: float shares, never rounded ([6]).

I found no source that gives the leftover to the payer.

Minor units: ISO 4217 is the authority ([7]), but `Intl.NumberFormat` follows CLDR, which differs from ISO for about 15 currencies ([8], [9]).

## Apps

- **Spliit** (`src/lib/shares.ts` [3]). Participants are sorted by participant id (DB order isn't stable), each share is floored, and the leftover goes out by largest remainder (Hamilton). Ties are rotated by FNV-1a(expense id) mod participant count, because "otherwise the same participants would absorb the extra unit every single time"; the code calls this "a pure function of the expense — no persisted cursor, no randomness". Balances sum these integer shares ([10]); a comment says the old per-participant rounding of float totals "used to break the books".
- **IHateMoney** (`ihatemoney/models.py` [6]). `amount` is a `db.Float`; each ower's spend is `weight * amount / total_weight` as a float, so there are no integer shares. Members are hidden once `abs(balance) > 0.01` is false.
- **Splitwise.** A 2018 admin reply says "the extra pennies get randomly assigned with a much larger variation than would be ideal" and "In theory, over time the way the extra pennies get assigned will be fair" ([4]). The thread is about share-based splits and promised a new method; I couldn't verify the current rule.
- **Tricount.** Its FAQ says: "If you split €100 by 3 users, one of the users will receive €33.34" ([5]). It doesn't say how that user is picked.
- **Settle Up.** I couldn't verify anything from a primary source.

## Libraries

- **Ruby `money` 7.1.1** (`Money#allocate`, alias `split` [1]): "left-over pennies will be distributed round-robin… parts listed first will likely receive more pennies"; `Money.new(100).allocate(3) #=> [34, 33, 33]`. Internally it truncates parts from the end and rebalances, so earlier parts get the leftover ([11]).
- **Dinero.js 2.0.2** (`allocate` → `distribute` [2]): shares are `integerDivide(value*ratio, total)`, then the leftover goes one unit at a time to indices sorted by descending ratio. With equal ratios the comparator always returns 1; V8 keeps the original order (tested on Node 24: `[0,1,2]`), so the first k get it, but the spec doesn't guarantee this.
- **py-moneyed:** no allocate/split API (grepped `src/moneyed`); formatting goes to Babel.
- **Fowler's Money pattern:** the catalog page only says "it's easy to lose pennies" ([12]); the allocate algorithm is in the book, which I didn't open.
- **JSR 354 / Moneta, Go/Rust libraries, Stripe:** not checked.

## Minor units (ISO 4217 vs CLDR/Intl)

- **ISO 4217 List One** (SIX XML, published 2026-09-17 [7]). `CcyMnrUnts` across unique codes: 2 → 139, 0 → 17 (e.g. JPY, KRW, CLP, ISK, VND, XAF), 3 → 7 (BHD, IQD, JOD, KWD, LYD, OMR, TND), 4 → 2 (CLF, UYW), and **"N.A." → 13**. N.A. covers XAU, XAG, XPD, XPT, XDR, XBA–XBD, XSU, XUA, XTS and XXX, which have no minor unit; a picker should probably exclude them.
- **ECMA-402.** `CurrencyDigits` is *implementation-defined*: "the number of fractional digits used when formatting", else 2 ([8]). It doesn't require ISO 4217.
- **CLDR** (`supplementalData.xml` `<fractions>` [9]) has `digits` plus separate `cashDigits`/`cashRounding` (e.g. CHF `cashRounding="5"`, SEK `cashDigits="0"`). Intl uses `digits`, not the cash values.
- **Measured mismatches** (ISO vs Node 24, ICU 78.3 / CLDR 48, `resolvedOptions().maximumFractionDigits`). Intl gives **0** where ISO says 2 for AFN, ALL, COP, HUF, IDR, IRR, KPW, LAK, LBP, MGA, MMK, PKR, SOS, SYP and YER. For **IQD**, ISO says 3 and Intl says 0. For every N.A. code Intl gives 2. JPY, KRW, BHD, KWD and TND match. RSD is odd: CLDR 48 says 0 but Node printed 2, so engine data can differ from raw CLDR; Firefox/Safari untested.
- **Implication** (my inference): with ISO minor units and Intl formatting, 1234 minor units of HUF (12.34) would display as "HUF 12". Reconcile the two sources, or pass explicit `minimumFractionDigits`/`maximumFractionDigits`.

## Candidate rules

"Stable": does adding/removing a participant move the leftover among untouched participants? "Fair": does one member systematically absorb leftovers?

| Rule | Used by | Deterministic | Stable under edits | Fair over time |
|---|---|---|---|---|
| First k participants by member creation order | Ruby `money`, Dinero.js (caller's order) | Yes | Mostly. It changes only when n or earlier members change | **No.** The earliest members always pay extra |
| Last k by order | none found | Yes | Same as above | No (the latest members) |
| Rotation seeded by expense id (`hash(id) mod n`) | Spliit [3] | Yes, pure function of the expense | Partly. Changing n changes the offset, so the leftover can jump | Roughly, in expectation |
| Random at write time, stored | Splitwise (2018, unverified today) [4] | No, unless stored | Only if stored. Recomputing on edit re-rolls | In expectation; high variance with few expenses |
| Payer absorbs (when payer is a participant) | none found | Yes | Yes | No (frequent payers). Undefined when the payer isn't a participant |
| Group-wide running cursor (persisted) | none found | Yes, given the stored state | Poor. Depends on edit history | Best (exact round-robin) |
| Float shares, no rounding | IHateMoney [6] | Yes | Yes | N/A. Shares don't sum to integers |

Explainability: "first k in member order" is easiest to state; seeded rotation needs the UI to show per-participant shares.

## Sources

1. Ruby money `Money#allocate` docs: https://github.com/RubyMoney/money/blob/1d60efeaeea009cfc69374421561b23b851bd36e/lib/money/money.rb#L558-L582
2. Dinero.js `distribute`: https://github.com/dinerojs/dinero.js/blob/76b969e519dc44675d4af898d25629995d0b16f2/packages/dinero.js/src/core/utils/distribute.ts#L33-L74
3. Spliit `shares.ts`: https://github.com/spliit-app/spliit/blob/73478ed2f67a59e83866948caeece6bf2ecb985e/src/lib/shares.ts#L24-L133
4. Splitwise feedback, admin reply 2018-03-23: https://feedback.splitwise.com/forums/162446-general/suggestions/33733765--bug-splitting-expense-by-shares-calculation-isn
5. Tricount FAQ: https://help.tricount.com/articles/tricount-faqs
6. IHateMoney `models.py`: https://github.com/spiral-project/ihatemoney/blob/e66a7672e8e5c41549bf53c4a824c72c43ab9079/ihatemoney/models.py#L132-L189 and column types at https://github.com/spiral-project/ihatemoney/blob/e66a7672e8e5c41549bf53c4a824c72c43ab9079/ihatemoney/models.py#L710-L718
7. ISO 4217 List One (SIX): https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
8. ECMA-402 §16.5.1 CurrencyDigits: https://tc39.es/ecma402/#sec-currencydigits
9. CLDR 48 `supplementalData.xml` fractions: https://github.com/unicode-org/cldr/blob/release-48/common/supplemental/supplementalData.xml#L11-L88
10. Spliit `balances.ts`: https://github.com/spliit-app/spliit/blob/73478ed2f67a59e83866948caeece6bf2ecb985e/src/lib/balances.ts#L16-L58
11. Ruby money `Allocation.generate`: https://github.com/RubyMoney/money/blob/1d60efeaeea009cfc69374421561b23b851bd36e/lib/money/money/allocation.rb#L24-L70
12. Fowler, Money (PoEAA catalog): https://martinfowler.com/eaaCatalog/money.html

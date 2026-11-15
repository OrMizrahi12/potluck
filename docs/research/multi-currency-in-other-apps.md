# Multi-currency in other shared-expense apps

Researched 2026-11-15. How do other shared-expense apps handle amounts in more than one currency? For each app: when and at what rate a foreign amount is converted, whether balances are kept per currency, where rates come from and whether users can override them, how settlements in another currency work, how converted amounts are rounded, what happens on edit, and what users complain about.

"Verified" means I read it in the app's own docs, API docs or source code. "Inferred" means it's my reading of indirect evidence. Each point is marked as one or the other.

## Answer

There are three models:

1. **Convert at entry and freeze the rate on the expense.** Balances and suggested settlements are in one group currency. Used by Spliit ([1]–[4]), Settle Up ([10], [11]) and Tricount ([8]). The original amount, original currency and rate are stored with the expense (Spliit and Settle Up, verified). Tricount's FAQ doesn't say what it stores.
2. **Keep separate balances per currency and never convert implicitly.** Used by Splitwise ([6], [7]). A paid, one-shot "Convert to [default currency]" rewrites _all_ of a group's expenses at _today's_ rate.
3. **Convert, but don't really freeze.** IHateMoney stores a converted amount but recomputes it on every save at the latest cached rate, not the bill's date ([12]). Cospend is only an entry-time calculator with manual project-level rates, and it keeps no original amount ([15]).

Every app with automatic rates lets you override them, except IHateMoney:

- Spliit takes a custom per-expense rate ([3]).
- Settle Up lets you edit the rate _or the converted amount_ directly, so you can enter what the bank charged. The custom rate then carries over to later transactions ([10]).
- Tricount lets you edit a per-currency rate and choose whether to reuse it ([8]).

Rounding is plain round-to-the-group-currency's-decimals at conversion time wherever I could see it: Spliit uses `toFixed(decimal_digits)` ([1]); IHateMoney uses `round(x, 2)`, even for JPY ([12]). No source documents a special rule.

The complaints repeat across apps:

- Converting at today's rate instead of the rate actually paid (Splitwise, [7]).
- Converting by-amount splits share by share, so the parts don't add up (Spliit, [5c], [5d]).
- An edited rate silently not applying (Spliit, [5b]).
- Fragility when the free rate API disappears (IHateMoney, [13]; Spliit added custom rates partly for this, [5a]).
- Users who want per-currency ledgers instead of conversion (IHateMoney, [13]; Spliit, [5e]).

## Comparison

|                              | Spliit                                                                                                           | Settle Up                                                                         | Tricount                                                                       | Splitwise                                                             | IHateMoney                                    | Cospend                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| When converted               | At entry, in the form                                                                                            | At entry                                                                          | At entry                                                                       | Never, unless Pro "Convert" is pressed                                | At entry and on every save                    | At entry (calculator only)                          |
| Rate frozen?                 | **Yes**, stored per expense                                                                                      | **Yes**, stored per transaction (`exchangeRates` map)                             | Rate is stored; frozen per expense is inferred                                 | Pro converts everything at the current rate, one-shot                 | **No**, recomputed at the latest rate on save | Not applicable; only the converted amount is stored |
| Rate date                    | Expense date (historical)                                                                                        | "current exchange rate for each day"                                              | "updated automatically on a daily basis"                                       | Today                                                                 | Today (24 h cache)                            | None (manual)                                       |
| Rate source                  | Frankfurter v2                                                                                                   | Yahoo                                                                             | "market rate" (unnamed)                                                        | "current market exchange rate"                                        | exchangerate.host                             | User-entered, per project                           |
| User override                | Custom rate per expense; group amount field is also editable                                                     | Edit rate **or converted amount**; sticky for later transactions; group-wide edit | Edit per-currency rate, optionally reused for future expenses; per participant | n/a                                                                   | None                                          | The rate _is_ the override                          |
| Balances                     | Group currency only                                                                                              | Group currency only (`debts` in group currency)                                   | Default currency only                                                          | **Per currency** (`balance[]` with `currency_code`)                   | Default currency only                         | Main currency only                                  |
| Settlement in other currency | Reimbursement: group amount is authoritative; "Amount to transfer" in another currency is derived, for reference | Not documented                                                                    | Not documented                                                                 | Record a payment in that currency; it reduces that currency's balance | No (settle plan in default currency)          | No                                                  |
| Original kept                | `originalAmount` + `originalCurrency` + `conversionRate`                                                         | `currencyCode` + `exchangeRates` on the transaction                               | Not documented                                                                 | Conversion may be irreversible ("isn't always possible")              | `amount` + `original_currency`                | Only as text appended to the title                  |
| Rounding                     | `toFixed(group decimals)`, then `Math.round` to minor units                                                      | Not documented                                                                    | Not documented                                                                 | Not documented                                                        | `round(x, 2)`, floats                         | Unrounded float                                     |
| Changing group currency      | Doesn't convert existing expenses (except for a minor-unit change)                                               | Server task `currencyChange`                                                      | Not documented                                                                 | n/a (per currency)                                                    | Blocked once bills exist                      | n/a                                                 |

## Apps

### Spliit (open source, read at `f293974`, 2026-11-12)

- **Schema** ([2]). `Group.currencyCode` is the group currency. `Expense.amount Int` is in group-currency minor units, plus nullable `originalAmount Int` (minor units of the original currency), `originalCurrency String` and `conversionRate Decimal`. Verified.
- **Rate source and date** ([4]). `useCurrencyRate` fetches `https://api.frankfurter.dev/v2/rates?date=<expenseDate>&base=<original>&quotes=<group>` in the browser, so the rate is the historical rate _for the expense date_. If the API returns a different date (future date, weekend), the form shows "Rates from date: {date}". If the currency isn't covered, it says "Enter a custom rate below." Verified. Frankfurter v2 adds 77 currencies over v1 ([5f]).
- **Conversion and rounding** ([1]). `convertToGroupCurrency = (originalAmount * rate).toFixed(groupCurrency.decimal_digits)`. The tests show `130.21 EUR × 38.4 → "5000.06" THB` and `10 × 163.456 → "1635" JPY`. On submit, amounts go to minor units with `Math.round(amount * 10 ** decimal_digits)` ([3]). Rates are always "1 original = rate group". Verified.
- **Override** ([3]). A "Use custom rate" toggle with a free-text rate field. The group-currency `amount` input stays editable (it isn't `readOnly` for normal expenses), so a user can type the bank's charged amount, but the stored `conversionRate` is then not recomputed to match. Verified in code; how often users do this is unknown.
- **Frozen on edit** ([3]). For an existing expense, `usingCustomConversionRate` starts as `!!defaultValues.conversionRate`, so a stored rate is treated as custom and is not refetched. The group amount is only recomputed when the original-amount field is touched. Verified. That second rule is the bug in "Amount does not update when exchange rate is edited" ([5b]): editing only the rate leaves the old group amount in place.
- **Balances** ([3a]). They sum `expense.amount` only, so they're all in the group currency. Verified.
- **Settlements in another currency** ([1], [3]). For a reimbursement, the direction flips. The group-currency amount (the balance being settled) drives the form, and the original-currency "Amount to transfer" is derived as `groupAmount / rate`, rounded to the original currency's decimals. A code comment says: "the group-currency amount stays the authoritative figure, and the original amount is only recorded for reference." Verified.
- **Changing group currency** (`messages/en-US.json`). "Changing this will NOT convert expenses already entered, except when the currency has different 'minor units' than the current one." Verified.
- **Complaints** (GitHub issues, first-party):
  - Split by amount converts each share separately, so the shares don't sum to the converted total ([5c], [5d]).
  - Editing a rate doesn't update the amount ([5b]).
  - Requests to _not_ convert and keep per-currency ledgers until settlement ([5e]). A fork added per-original-currency balance views, noting "reimbursing in the group currency will not settle the corresponding original-currency balance."
  - In the original feature thread ([5a]), a user noted that card and exchange-office rates differ from API rates, hence the request for a manual rate.

### Settle Up (closed source; official tips page and public API docs)

- **Conversion and rate** ([10]). "If you add a transaction in a different currency, the exchange rate is automatically downloaded from a Yahoo service based on the current exchange rate for each day. You can see it on the transaction detail screen." Verified.
- **Override, including the bank's amount** ([10]). "You can edit the exchange rate or the calculated amount in group currency. If you do that, all future transactions will use this exchange rate until you change back to current… This is useful when you want to use one exchange rate for the whole vacation. You can also change all exchange rates from Edit group screen." Verified.
- **Data model** ([11]). A group has `convertedToCurrency` (the group currency). Each transaction has `currencyCode`, `exchangeRates: {"EUR": "27.05", "USD": "21.70"}` (commented "1 = X in currencyCode currency") and `fixedExchangeRate` ("exchange rate changed manually, next transaction should be fixed as well"). Amounts are decimal strings. Server-generated `/debts/<groupId>/` entries carry an "amount in group currency". The server task `currencyChange` (groupId, targetCurrency) changes the group currency. Verified. Because the rates sit on each transaction, I infer they are frozen at entry. I infer that `currencyChange` reconverts using those stored rates, but the docs don't say.
- **Rounding, settlements in other currencies, complaints:** no primary source found.

### Tricount (closed source, owned by bunq; FAQ)

- **Current FAQ** ([9]): "tricount enables you to create tricounts using a single currency. You can enter expenses in different currencies. However, if the default currency is EUR, the reimbursement suggestion will be shown in EUR, regardless of the currencies of your expenses. The amount is converted according to the market rate and the app provides you with a daily exchange rate." Verified.
- **Older FAQ (v3.7)** ([8], Wayback snapshot of 2024-04-16; the live URL now 404s): "this rate is updated automatically on a daily basis. You can as well manually edit the rate for a currency at any time. In that case, you can decide whether or not to use it for future expenses. This setting will not impact the expenses that other participants add to the tricount." Verified for 2024; current app behaviour is unverified. "Does not impact other participants" means the remembered custom rate is a per-device or per-user default.
- **Not documented:** rounding, whether an edited expense keeps its rate, settlement in another currency, rate provider. No first-party complaint forum found.

### Splitwise (closed source; help centre, API docs, UserVoice)

- **Per-currency balances** ([6]): "Splitwise keeps balances in each currency separate by default — for example, 'You owe $12.45 and you are owed £8.72.' New expenses default to the last currency used in that group or friendship." Changing an expense's or payment's currency "only changes the currency label on the expense, it does not convert the amount." Verified. The API returns `balance`, `original_debts` and `simplified_debts` as arrays, each with a `currency_code`, and the reference has no exchange-rate field ([14]). Verified.
- **Pro conversion** ([6]). It "converts all expenses in a group or friendship to your default currency at the current market exchange rate". It "applies to all expenses … including ones that are already settled", and expenses added later "won't be converted automatically" (press Convert again). Reverting needs support and "isn't always possible — especially if multiple conversions have been made". Verified. The "default currency" is the _pressing user's_ account setting, not a group setting ([6]), so different members could convert to different currencies. That is inferred from the wording.
- **Settlements in another currency** ([6]). A payment carries a currency like an expense does, so it settles that currency's balance. Verified.
- **Rate choice** ([7]). A 2015 admin reply declining historical rates: "we show the current exchange rate, and then convert all expenses at that rate. It makes currency conversion easier to understand, and we actually found that it's what most people expect." Verified as a 2015 statement; the current help page still says "current market exchange rate".
- **Complaints** ([7]). One user who paid for Pro for this feature reports that settling an Iceland trip a year later at the current ISK rate made a friend pay "over $100 more than she should have". Another asks to "remember the original currency for every transaction". A separate suggestion asks to show both the original and the converted amount ([7b]). Verified.
- **Rounding:** not documented.

### IHateMoney (open source, read at `e66a767`, 2026-08-07)

- **Schema** ([12]). `Project.default_currency`, `Bill.amount` (float, original currency), `Bill.original_currency`, `Bill.converted_amount` (float). There is no stored rate. Balances and the settle plan use `converted_amount` and are labelled `default_currency`. Verified.
- **Rate and rounding** ([12]). `CurrencyConverter` fetches `https://api.exchangerate.host/latest?base=USD` (latest rates only, cached 24 h) and computes `round(amount / source_rate * dest_rate, 2)`, which is 2 decimals for every currency. Verified.
- **On edit** ([12]). `BillForm.save` recomputes `converted_amount` at the _current_ rate every time a bill is saved, so editing an old bill's title moves its converted value. That the value moves is my inference from the code. The bill date isn't used for the rate.
- **Changing project currency** ([12]). Blocked once bills exist, with the message "Cannot change project currency because currency conversion is broken". Verified.
- **Complaints** ([13]). The rate API went away and projects stopped working. The maintainers floated removing currencies, per-bill manual rates, or project-level fixed rates. Users split between wanting conversion and wanting separate per-currency balances "like Splitwise". The thread leans towards "conversion rates fixed in the per-project settings" but nobody has volunteered to build it. Verified.

### Cospend (Nextcloud app, open source, read at `12530fd`)

- **Model** ([15]). A project has a main currency plus user-defined currencies, each with a manual `exchange_rate` to the main currency. Bills have only `amount` (float, main currency). The bill form's currency picker multiplies the typed amount by the rate and appends "(12.00 USD)" to the bill title. The UI says: "This is just a currency converter… Value is always stored in [main currency]." Verified. No rounding is applied; the title text uses `toFixed(2)`.

## Inferences and gaps

- No app I found documents how it rounds a converted amount beyond "to the currency's decimals". None documents a rule for keeping the leftover cents of a converted equal split consistent with the original-currency split.
- Only Settle Up documents entering the _converted amount_ directly, which is the "my bank charged X" case. In Spliit you can do it by editing the group amount, but the stored rate then disagrees with the stored amounts.
- I found no first-party sources for Tricount or Settle Up complaints. App-store reviews were not used.
- Not covered: Splid, SplitMyExpenses, Tabby, Kittysplit.

## Sources

1. Spliit, `src/lib/currency-conversion.ts` and `.test.ts` — https://github.com/spliit-app/spliit/blob/f293974bb3f0da063c1ced76a4abeb48eddee1e3/src/lib/currency-conversion.ts
2. Spliit, `prisma/schema.prisma` (Group, Expense) — https://github.com/spliit-app/spliit/blob/f293974bb3f0da063c1ced76a4abeb48eddee1e3/prisma/schema.prisma
3. Spliit, `src/app/groups/[groupId]/expenses/expense-form.tsx` (lines ~330–545, 893+) and `src/lib/utils.ts` `amountAsMinorUnits` — https://github.com/spliit-app/spliit/blob/f293974bb3f0da063c1ced76a4abeb48eddee1e3/src/app/groups/%5BgroupId%5D/expenses/expense-form.tsx
   - 3a. Spliit, `src/lib/balances.ts` — https://github.com/spliit-app/spliit/blob/f293974bb3f0da063c1ced76a4abeb48eddee1e3/src/lib/balances.ts
4. Spliit, `src/lib/hooks.ts` `useCurrencyRate` — https://github.com/spliit-app/spliit/blob/f293974bb3f0da063c1ced76a4abeb48eddee1e3/src/lib/hooks.ts
5. Spliit issues:
   - 5a. #53 "Ability to select different currency for each transaction" — https://github.com/spliit-app/spliit/issues/53
   - 5b. #482 "Amount does not update when exchange rate is edited" — https://github.com/spliit-app/spliit/issues/482
   - 5c. #411 "Unclear why sum of amounts fails when converting currencies" — https://github.com/spliit-app/spliit/issues/411
   - 5d. #690 "Split by amount converts each share at the fetched rate when a custom rate is set" — https://github.com/spliit-app/spliit/issues/690
   - 5e. #412 "Make converting currency in expense optional" — https://github.com/spliit-app/spliit/issues/412
   - 5f. #449 "Support currencies that are not in the Frankfurter API" — https://github.com/spliit-app/spliit/issues/449
6. Splitwise Help Center, "How can I manage a friendship or group with multiple currencies?" — https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies
7. Splitwise UserVoice, "Use historical exchange rate data…" (declined, admin reply 2015-04-29) — https://splitwise.uservoice.com/forums/162446-general/suggestions/7710975-use-historical-exchange-rate-data-via-google-or-f
   - 7b. Splitwise UserVoice, "Allow two (or more) currencies" — https://splitwise.uservoice.com/forums/162446-general/suggestions/8532622-allow-two-or-more-currencies
8. Tricount FAQ, "How can I use multiple currencies in a tricount?" (Wayback 2024-04-16) — http://web.archive.org/web/20240416051858/https://www.tricount.com/en/manage-a-tricount-with-many-currencies
9. Tricount help, "Does tricount work with different currencies?" — https://help.tricount.com/d/61447
10. Settle Up, Tips: "Exchange rates are from Yahoo, but you can change them" — https://settleup.io/tips
11. Settle Up Public API, Data entities and Operations — https://api.settleup.io/entities/ , https://api.settleup.io/operations/
12. IHateMoney, `ihatemoney/currency_convertor.py`, `models.py` (`Bill`, `Project.balance`, `switch_currency`), `forms.py` (`BillForm.save`, `validate_default_currency`) — https://github.com/spiral-project/ihatemoney/tree/e66a7672e8e5c41549bf53c4a824c72c43ab9079/ihatemoney
13. IHateMoney issue #1232 "Currencies: rework or remove?" — https://github.com/spiral-project/ihatemoney/issues/1232
14. Splitwise API reference (group/friend `balance`, `original_debts`, `simplified_debts`) — https://dev.splitwise.com/
15. Cospend, `src/BillForm.vue` (`onCurrencyConvert`), `src/CurrencyManagement.vue`, `lib/Db/Bill.php` — https://github.com/julien-nc/cospend-nc/tree/12530fd4f249688acf4a19ce801de5741baa218f

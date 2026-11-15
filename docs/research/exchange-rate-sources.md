# Where exchange rates can come from

Researched 2026-11-15 for the ticket "Where exchange rates can come from" on the map "Map: multi-currency groups". The question: which exchange-rate sources are free and need no account, and what does each offer?

Coverage is measured against the picker, meaning the 164 codes in `src/currency/currencies.ts` (ISO 4217 List One of 2026-09-17, minus the 13 codes with no minor unit). Every coverage number below comes from live calls I made on 2026-11-15, not from the providers' marketing copy. The scripts and raw responses were throwaway and aren't kept here.

## Answer

Four sources are free and need no key. They differ a lot:

| Source                                                                                             | Picker codes covered (of 164) | History by date                                                              | Updates                                      | Terms, in short                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frankfurter v2** (`api.frankfurter.dev/v2`), blended from 111 central banks and official sources | **154**                       | Yes, back to 1948 for USD. Per-currency start dates vary, 2025 at the latest | Throughout the day, as each source publishes | Blended rates "free to use". Single-provider routes follow that provider's terms. MIT code, self-hostable. Says it logs no IPs or URLs                           |
| **ECB euro reference rates** (direct, or Frankfurter v1 / `providers=ecb`)                         | **30** (EUR + 29)             | Yes, full series since 1999-01-04 as one file                                | Once per TARGET working day, about 16:00 CET | Free reuse, ECB must be cited. "For information purposes only", and transaction use is "strongly discouraged"                                                    |
| **ExchangeRate-API open access** (`open.er-api.com/v6/latest/{base}`)                              | **153**                       | **No.** History is paid plans only                                           | Once a day                                   | Commercial use OK. **Attribution link required.** No redistribution. Rate limited (HTTP 429, 20-minute block). Free plans "can be discontinued … without notice" |
| **fawazahmed0 currency-api** (npm package served by jsDelivr, with a Cloudflare Pages fallback)    | **156**                       | Yes, daily snapshots since **2024-03-02** (2 days missing)                   | Once a day                                   | CC0. No rate limits stated. **Upstream sources undisclosed** (kept in CI secrets, one scraped with a headless browser)                                           |

- **Codes no free no-key source covers (7):** BOV, CHE, CHW, COU, USN, UYW, XAD. All are fund codes, units of account, or the US next-day dollar, not banknotes anyone pays with.
- **Codes with only thin coverage:**
  - CLF (Chilean Unidad de Fomento): ExchangeRate-API only, so latest rate only, no history.
  - MXV and VED: fawazahmed0 only, so history goes back only to 2024-03-02, from undisclosed upstream sources.
  - KPW and SVC: Frankfurter v2 and fawazahmed0.
- **Where only a hand-typed rate works:**
  - the 7 codes above, on any date;
  - CLF on any past date;
  - MXV and VED before 2024-03-02;
  - any currency before its first published date (for example XCG before 2025-03-31, ZWG before 2024-09-02, SLE before 2022-07-01, in Frankfurter).
- **Sources ruled out because they need a key:** exchangerate.host (now apilayer; it answers `missing_access_key`), Open Exchange Rates (`missing_app_id`). Both checked live.

## Sources in detail

### Frankfurter v2

- **What it is.** "A free exchange rate API for 219 currencies and 39 other assets from 111 central banks and official sources" ([1]). The live `/v2/currencies` returned 200 rows: 161 currencies, 35 crypto and 4 metals. `/v2/providers` lists 111 providers: 98 publish daily, 8 monthly, 2 weekly, 1 quarterly and 2 unstated.
- **v1 versus v2.** v1 is the old ECB-only API. "The v1 API is deprecated in favor of v2, but remains available indefinitely" ([2]). `/v1/currencies` returned exactly the ECB's 30 codes.
- **Blending.**
  - "By default, rates are blended across all providers." Weekly, monthly and quarterly sources "are excluded from the blended feed". Pegged-currency rows "come from the peg, not provider data". `providers=ecb` (or another provider key) scopes a request to one source, and `expand=providers` shows which sources contributed ([2]).
  - In practice each contributor carries its own date, and a blended row can mix dates. For example, EUR→KPW dated 2026-11-12 came from BOM (2026-11-10) and CBKKW (2026-11-12).
- **Coverage.** 154 of the 164 picker codes in both `/v2/currencies` and the latest blended EUR rates. Missing: BOV, CHE, CHW, CLF, COU, MXV, USN, UYW, VED, XAD. VES is covered; VED is not. Every covered picker code had a blended rate dated 2026-11-01 or later.
- **History.**
  - `GET /v2/rates?date=YYYY-MM-DD&base=…&quotes=…` works. "Daily history goes back to 1948" ([1]); USD starts 1948-06-21 and CHF, DKK, GBP and NOK start 1949-12-21.
  - Later starts include MGA 2005, AZN 2006, GHS 2007, ZMW 2013, BYN 2016, MRU and STN 2018, VES 2018-05-29, SLE 2022-07-01, ZWG 2024-09-02 and XCG 2025-03-31.
  - A Sunday (2026-11-08) returned rates dated 2026-11-08. The docs don't explain weekend or holiday handling ([2]).
- **Rate limits.** "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly or daily caps" ([1]). No numbers are published. Responses send `cache-control: public, max-age=3600` on v2 and `max-age=86400` on v1 latest.
- **Terms.**
  - "Blended rates are Frankfurter's own calculation and free to use". Direct queries to one provider's endpoint follow that provider's terms, linked from the site ([1]). 54 of the 111 providers list a `terms_url`.
  - I found no formal terms-of-service page and no attribution requirement. The code is MIT ([3]).
- **Reliability.**
  - The project is run by one maintainer (`lineofflight`), was created in 2018, has about 2,100 stars, and was last pushed 2026-11-13 ([3]). I found no published uptime record or SLA.
  - It can be self-hosted: `docker run -d --init -p 8080:8080 lineofflight/frankfurter` ([3]). That removes the dependency on the public instance but not on the upstream banks.
- **Privacy.** "The API doesn't collect or log personal data, IP addresses, or request URLs." The public instance runs behind Cloudflare, which "only provides aggregate traffic stats" ([1]). That is the operator's own claim; I didn't verify it independently.
- **A surprise.** For CUP the blend excludes Banco Central de Cuba's own rate (921.83 per EUR) and the NBP figure, and returns about 26.59, which is near the official peg. A blended "official" rate can differ greatly from what a traveller actually pays.

### ECB euro reference rates (direct)

- **What they are.** Spot rates against the euro, "based on the daily concertation procedure between central banks across Europe". They are "usually updated at around 16:00 CET" on TARGET working days ([4]).
- **Coverage.** 29 currencies plus EUR, so 30 picker codes. The euro/rouble rate has been suspended since 1 March 2022 ([4]).
- **Files.** Daily XML (`eurofxref-daily.xml`), the full history as CSV or XML (`eurofxref-hist.zip` / `.xml`), and the last 90 days ([4]). Frankfurter v1 returned rates for 1999-01-04, the first euro day, and "not found" for 1990.
- **Terms.**
  - The rates are "published for information purposes only. Using the rates for transaction purposes is strongly discouraged" ([4]).
  - The website content may be reused freely if "it must appear accurately and the ECB must be cited as the source", and any modification must be stated explicitly ([5]).
- **Reliability.** The issuer is a central bank and the series has been published every working day since 1999. There are no rates on TARGET holidays or weekends. The live response came from a CDN (`server: myracloud`, `cache-control: max-age=300`).

### ExchangeRate-API open access (`open.er-api.com`)

- **Coverage.**
  - `/v6/latest/USD` returned 166 codes, covering 153 picker codes. Missing: BOV, CHE, CHW, COU, KPW, MXV, SVC, USN, UYW, VED, XAD.
  - It is the only free source with CLF.
  - It also returns non-picker codes (ANG, BGN, HRK, SLL, ZWL, CNH, FOK, GGP, IMP, JEP, KID, TVD, XDR). An unknown base returns `{"error-type":"unsupported-code"}`.
- **History.** None on the free endpoint. "Historical exchange rates are only accessible by paid accounts"; only "Pro, Business or Volume" plans get them ([6]). `/v6/history/…` returned 404 without a key.
- **Updates.** "Updates Once Per Day". Each response carries `time_next_update_unix` ([7]).
- **Rate limits.** "Rate limited IP's will receive HTTP code 429 responses. After 20 minutes the rate limit will finish." No threshold is published. The docs suggest requesting hourly at most if you can't cache for 24 hours ([7]).
- **Terms.**
  - "We require attribution on the pages you're using these rates with the link below", meaning "Rates By Exchange Rate API" linked to exchangerate-api.com ([7]).
  - Use for "personal or commercial currency conversion purposes" is allowed and caching is permitted, but "not allowed to re-distribute it" ([7], [8]).
  - The terms say "the available Free Plans can be discontinued by ExchangeRate-API without notice", and they give no accuracy warranty ([8]).
- **Reliability.**
  - The docs link a Pingdom uptime record, but there is no SLA.
  - "Over time we inevitably have to stop supporting certain endpoints … we can't predict when". A `time_eol_unix` field announces deprecation, and it was 0 on 2026-11-15 ([7]).
- **Privacy.** The terms don't say whether API requests are logged. The general privacy section covers "collection, transfer, storage and use of your personal information" ([8]).

### fawazahmed0 currency-api (via jsDelivr)

- **What it is.** URL pattern `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{base}.json`, with `{date}` either `latest` or `YYYY-MM-DD`. A fallback lives at `https://{date}.currency-api.pages.dev/v1/…`. The README warns users to "include Fallback mechanism in your code" ([9]).
  - It moved here in 2024 after "I got email from GitHub to remove currency-api repository, due to large size" ([10]). The old `gh/fawazahmed0/currency-api@1` URLs are the pre-2024 form.
- **Coverage.**
  - `latest/v1/currencies/eur.json` returned 339 keys, including crypto. That covers 156 picker codes. Missing: BOV, CHE, CHW, CLF, COU, USN, UYW, XAD.
  - CLF is deliberately removed in the source (`currencyCodesToRemove = ["CLF"]`) ([11]).
  - It is the only free source with MXV and VED.
- **History.**
  - There is one npm version per day. The registry has 986 date tags from 2024-03-02 to 2026-11-14, with 2025-12-10 and 2026-08-19 missing. `@2024-03-01` returns 404.
  - jsDelivr says files are "permanently stored", so old versions keep serving even if a package is removed ([12]).
- **Updates.** "Daily Updated" ([9]), published by a GitHub Actions run.
- **Rate limits.** "No Rate limits" ([9]). jsDelivr says "There are no bandwidth limits" ([12]). Responses send `cache-control: public, max-age=604800, s-maxage=43200`.
- **Terms.**
  - The repository is CC0-1.0 ([13]). There is no attribution requirement.
  - jsDelivr's own terms and acceptable-use pages render client-side and I couldn't read their text. I found nothing on whether using jsDelivr as a data API is within its policy.
- **Provenance (the main caveat).**
  - `currscript.js` reads its upstream URLs from CI secrets (`process.env.currlink`, `currlink2`, `currlink3`, `cryptolink`). One of them is loaded in a headless Firefox through Playwright, which captures the JSON the page fetches ([11]).
  - So the public repo doesn't show where the fiat rates come from, or under what terms. The CC0 label covers the author's work; I couldn't establish whether it covers the upstream data.
- **Reliability.**
  - The project is run by one maintainer, has about 2,700 stars, and the repo was last pushed 2026-10-01 ([13]). The daily publish has missed 2 days in 2.7 years.
  - The CDN layer is strong: jsDelivr uses Cloudflare and Fastly with failover ([12]).
- **Privacy.** jsDelivr, Cloudflare and Fastly see the request. I couldn't read jsDelivr's privacy policy text (it renders client-side).

### Other no-key primaries found

- **National Bank of Poland API.** `api.nbp.pl/api/exchangerates/tables/B/` answers without a key. Table B covers many exotic currencies but is published weekly (the live response was dated 2026-11-10). Frankfurter already ingests it as provider `NBP`.
- **The other central banks in Frankfurter's provider list.** Calling them directly is possible, but each has its own format and terms. That is the work Frankfurter does.

## What a server-side call reveals

Calling from Potluck's server (Vercel fra1), not from the browser:

- **What the provider sees:**
  - Vercel's egress IP, which is shared AWS infrastructure in Frankfurt, not a member's IP;
  - the User-Agent of the server's HTTP client;
  - the time of the request;
  - the path: base currency, quote currency (for Frankfurter v2) and date.
- **What it doesn't see:** member names, group links or amounts, unless Potluck puts them in the request. None of the APIs above needs any of those.
- **What it might infer:** if Potluck fetched one rate per expense, the timing plus the currency pair and date would hint at one group's activity, though not who is in it. Fetching a whole table per base and date, or caching on Potluck's side, makes requests independent of any one group. This is an observation about request shape, not a recommendation.
- **What Potluck's privacy page promises:** it says Potluck has "nothing from other sites that could follow you" and that it "doesn't pass a group's link on to other sites" (`src/app/privacy/page.tsx`).
  - A server-side call keeps both promises as written.
  - A browser-side call to any of these hosts would expose the member's IP to a third party. That is relevant to the first promise.
- **What each provider says it keeps:** only Frankfurter makes an explicit no-logging claim ([1]). ExchangeRate-API and jsDelivr say nothing specific about API request logs in what I could read.

## Sources

1. Frankfurter home page and FAQ: https://frankfurter.dev/
2. Frankfurter v2 docs: https://frankfurter.dev/docs/
3. Frankfurter repository (MIT, README, Docker): https://github.com/lineofflight/frankfurter
4. ECB euro foreign exchange reference rates: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
5. ECB disclaimer and copyright: https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html
6. ExchangeRate-API historical data docs: https://www.exchangerate-api.com/docs/historical-data-requests
7. ExchangeRate-API open access (free) docs: https://www.exchangerate-api.com/docs/free
8. ExchangeRate-API terms: https://www.exchangerate-api.com/terms
9. fawazahmed0/exchange-api README: https://github.com/fawazahmed0/exchange-api#readme
10. fawazahmed0/exchange-api issue 89, "What happened to old currency-api": https://github.com/fawazahmed0/exchange-api/issues/89
11. fawazahmed0/exchange-api `currscript.js`: https://github.com/fawazahmed0/exchange-api/blob/main/currscript.js
12. jsDelivr README (bandwidth, permanent storage, providers): https://github.com/jsdelivr/jsdelivr#readme
13. fawazahmed0/exchange-api repository metadata (CC0-1.0): https://github.com/fawazahmed0/exchange-api
14. npm registry, `@fawazahmed0/currency-api`: https://registry.npmjs.org/@fawazahmed0/currency-api
15. ISO 4217 List One as vendored in Potluck: `src/currency/iso-4217.ts`

Live probes (2026-11-15): `api.frankfurter.dev/v1/currencies`, `/v1/latest`, `/v1/1999-01-04`, `/v2/currencies`, `/v2/providers`, `/v2/rates` (latest, `date=2026-11-08`, `date=2010-06-15`, `expand=providers`); `www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`; `open.er-api.com/v6/latest/USD`; `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{latest,2024-03-01,2024-03-02,…}/v1/currencies/eur.json`; `{2025-01-01,latest}.currency-api.pages.dev`; `api.exchangerate.host/live`; `openexchangerates.org/api/latest.json`; `api.nbp.pl/api/exchangerates/tables/B/`.

// PROTOTYPE, throw away. How the expense and settlement lists show a foreign
// amount, per variant. The group page pretends its two newest expenses and
// newest settlement were recorded in another currency.

import { formatAmount } from "@/money/format";
import { pretendSaved } from "./fake-rates";
import { formatRate, VARIANTS, type Variant } from "./shared";

export function prototypeVariant(
  asked: string | string[] | undefined
): Variant | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return typeof asked === "string" &&
    (VARIANTS as readonly string[]).includes(asked)
    ? (asked as Variant)
    : undefined;
}

type Group = { currency: string; digits: number };

function parts(minor: number, group: Group, locale: string) {
  const p = pretendSaved(group.currency, minor, group.digits);
  return {
    foreign: formatAmount(p.foreignMinor, p, locale),
    group: formatAmount(minor, group, locale),
    rate: `1 ${p.currency} = ${formatRate(p.rate)} ${group.currency}`,
  };
}

/** The amount column of an expense row. */
export function ExpenseAmount({
  variant,
  minor,
  group,
  locale,
}: {
  variant: Variant;
  minor: number;
  group: Group;
  locale: string;
}) {
  const p = parts(minor, group, locale);
  switch (variant) {
    case "A":
      return <span className="amount">{p.group}</span>;
    case "B":
      return (
        <span
          className="amount"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <span>{p.foreign}</span>
          <span className="muted" style={{ margin: 0, fontWeight: "normal" }}>
            = {p.group}
          </span>
        </span>
      );
    case "C":
      return (
        <span className="amount">
          <span style={{ fontWeight: "normal" }}>{p.foreign} → </span>
          {p.group}
        </span>
      );
  }
}

/** Extra text for an expense row's muted line, or null. */
export function ExpenseNote({
  variant,
  minor,
  group,
  locale,
}: {
  variant: Variant;
  minor: number;
  group: Group;
  locale: string;
}) {
  const p = parts(minor, group, locale);
  if (variant === "A")
    return (
      <>
        Paid {p.foreign} at {p.rate} ·{" "}
      </>
    );
  if (variant === "B") return <>{p.rate} · </>;
  return null;
}

/** The amount in a settlement row. */
export function SettlementAmount({
  variant,
  minor,
  group,
  locale,
}: {
  variant: Variant;
  minor: number;
  group: Group;
  locale: string;
}) {
  const p = parts(minor, group, locale);
  switch (variant) {
    case "A":
      return (
        <>
          <span className="amount">{p.group}</span>{" "}
          <span className="muted">({p.foreign})</span>
        </>
      );
    case "B":
      return (
        <>
          <span className="amount">{p.foreign}</span>{" "}
          <span className="muted">= {p.group}</span>
        </>
      );
    case "C":
      return (
        <span className="amount">
          {p.foreign} → {p.group}
        </span>
      );
  }
}

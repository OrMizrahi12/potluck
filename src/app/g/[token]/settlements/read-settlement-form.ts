import type { AddSettlementInput } from "@/group/service";

/** The settlement form's fields, as the group service takes them. */
export function readSettlementForm(form: FormData): AddSettlementInput {
  const input: AddSettlementInput = {
    fromId: String(form.get("from") ?? ""),
    toId: String(form.get("to") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
  };
  // The form sends a foreign currency only when one other than the group
  // currency is picked.
  const foreignCurrency = String(form.get("foreignCurrency") ?? "");
  if (foreignCurrency === "") return input;
  return {
    ...input,
    foreign: {
      amount: String(form.get("foreignAmount") ?? ""),
      currency: foreignCurrency,
      rate: String(form.get("exchangeRate") ?? ""),
    },
  };
}

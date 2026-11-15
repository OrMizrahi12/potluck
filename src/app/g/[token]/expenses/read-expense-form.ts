import type { AddExpenseInput } from "@/group/service";

/** The expense form's fields, as the group service takes them. */
export function readExpenseForm(form: FormData): AddExpenseInput {
  const input: AddExpenseInput = {
    description: String(form.get("description") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
    payerId: String(form.get("payer") ?? ""),
    participantIds: [...new Set(form.getAll("participant").map(String))],
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

import type { AddExpenseInput } from "@/group/service";

/** The expense form's fields, as the group service takes them. */
export function readExpenseForm(form: FormData): AddExpenseInput {
  return {
    description: String(form.get("description") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
    payerId: String(form.get("payer") ?? ""),
    participantIds: [...new Set(form.getAll("participant").map(String))],
  };
}

import type { AddExpenseInput } from "@/group/service";
import { readForeignPartFields } from "../read-foreign-part-fields";

/** The expense form's fields, as the group service takes them. */
export function readExpenseForm(form: FormData): AddExpenseInput {
  const input: AddExpenseInput = {
    description: String(form.get("description") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
    payerId: String(form.get("payer") ?? ""),
    participantIds: [...new Set(form.getAll("participant").map(String))],
  };
  const foreign = readForeignPartFields(form);
  return foreign ? { ...input, foreign } : input;
}

import type { AddSettlementInput } from "@/group/service";

/** The settlement form's fields, as the group service takes them. */
export function readSettlementForm(form: FormData): AddSettlementInput {
  return {
    fromId: String(form.get("from") ?? ""),
    toId: String(form.get("to") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
  };
}

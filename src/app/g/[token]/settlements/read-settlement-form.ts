import type { AddSettlementInput } from "@/group/service";
import { readForeignPartFields } from "../read-foreign-part-fields";

/** The settlement form's fields, as the group service takes them. */
export function readSettlementForm(form: FormData): AddSettlementInput {
  const input: AddSettlementInput = {
    fromId: String(form.get("from") ?? ""),
    toId: String(form.get("to") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
  };
  const foreign = readForeignPartFields(form);
  return foreign ? { ...input, foreign } : input;
}

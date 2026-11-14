"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { addSettlement, type AddSettlementRefusal } from "@/group/service";

export type AddSettlementFormState = { refusal?: AddSettlementRefusal };

export async function addSettlementAction(
  linkToken: string,
  _previous: AddSettlementFormState,
  form: FormData
): Promise<AddSettlementFormState> {
  const result = await addSettlement(getDb(), linkToken, {
    fromId: String(form.get("from") ?? ""),
    toId: String(form.get("to") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
  });
  if (!result.ok) return { refusal: result.reason };
  redirect(`/g/${linkToken}`);
}

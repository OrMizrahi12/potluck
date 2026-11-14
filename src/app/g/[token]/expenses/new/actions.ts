"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { addExpense, type AddExpenseRefusal } from "@/group/service";

export type AddExpenseFormState = {
  refusal?: AddExpenseRefusal;
  /** How many participants were chosen, for "too small to split among N". */
  participants?: number;
};

export async function addExpenseAction(
  linkToken: string,
  _previous: AddExpenseFormState,
  form: FormData
): Promise<AddExpenseFormState> {
  const participantIds = [...new Set(form.getAll("participant").map(String))];
  const result = await addExpense(getDb(), linkToken, {
    description: String(form.get("description") ?? ""),
    amount: String(form.get("amount") ?? ""),
    date: String(form.get("date") ?? ""),
    payerId: String(form.get("payer") ?? ""),
    participantIds,
  });
  if (!result.ok) {
    return { refusal: result.reason, participants: participantIds.length };
  }
  redirect(`/g/${linkToken}`);
}

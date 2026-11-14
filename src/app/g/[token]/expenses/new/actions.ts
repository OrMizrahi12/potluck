"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { addExpense } from "@/group/service";
import { readExpenseForm } from "../read-expense-form";
import type { ExpenseFormState } from "../expense-form";

export async function addExpenseAction(
  linkToken: string,
  _previous: ExpenseFormState,
  form: FormData
): Promise<ExpenseFormState> {
  const input = readExpenseForm(form);
  const result = await addExpense(getDb(), linkToken, input);
  if (!result.ok) {
    return {
      refusal: result.reason,
      participants: input.participantIds.length,
    };
  }
  redirect(`/g/${linkToken}`);
}

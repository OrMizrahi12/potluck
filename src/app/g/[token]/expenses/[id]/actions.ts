"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { deleteExpense, editExpense } from "@/group/service";
import type { DeleteEntryState } from "../../delete-entry";
import type { ExpenseFormState } from "../expense-form";
import { readExpenseForm } from "../read-expense-form";

export async function editExpenseAction(
  linkToken: string,
  expenseId: string,
  version: number,
  _previous: ExpenseFormState,
  form: FormData
): Promise<ExpenseFormState> {
  const input = readExpenseForm(form);
  const result = await editExpense(getDb(), linkToken, {
    expenseId,
    version,
    ...input,
  });
  if (!result.ok) {
    return {
      refusal: result.reason,
      participants: input.participantIds.length,
    };
  }
  redirect(`/g/${linkToken}`);
}

export async function deleteExpenseAction(
  linkToken: string,
  expenseId: string,
  version: number
): Promise<DeleteEntryState> {
  const result = await deleteExpense(getDb(), linkToken, {
    expenseId,
    version,
  });
  if (!result.ok) {
    return {
      refusal:
        result.reason === "expense-unknown" ? "entry-unknown" : result.reason,
    };
  }
  redirect(`/g/${linkToken}`);
}

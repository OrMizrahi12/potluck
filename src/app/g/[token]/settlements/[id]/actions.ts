"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { deleteSettlement, editSettlement } from "@/group/service";
import type { DeleteEntryState } from "../../delete-entry";
import { readSettlementForm } from "../read-settlement-form";
import type { SettlementFormState } from "../settlement-form";

export async function editSettlementAction(
  linkToken: string,
  settlementId: string,
  version: number,
  _previous: SettlementFormState,
  form: FormData
): Promise<SettlementFormState> {
  const result = await editSettlement(getDb(), linkToken, {
    settlementId,
    version,
    ...readSettlementForm(form),
  });
  if (!result.ok) return { refusal: result.reason };
  redirect(`/g/${linkToken}`);
}

export async function deleteSettlementAction(
  linkToken: string,
  settlementId: string,
  version: number
): Promise<DeleteEntryState> {
  const result = await deleteSettlement(getDb(), linkToken, {
    settlementId,
    version,
  });
  if (!result.ok) {
    return {
      refusal:
        result.reason === "settlement-unknown"
          ? "entry-unknown"
          : result.reason,
    };
  }
  redirect(`/g/${linkToken}`);
}

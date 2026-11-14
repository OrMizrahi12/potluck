"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { addSettlement } from "@/group/service";
import { readSettlementForm } from "../read-settlement-form";
import type { SettlementFormState } from "../settlement-form";

export async function addSettlementAction(
  linkToken: string,
  _previous: SettlementFormState,
  form: FormData
): Promise<SettlementFormState> {
  const result = await addSettlement(
    getDb(),
    linkToken,
    readSettlementForm(form)
  );
  if (!result.ok) return { refusal: result.reason };
  redirect(`/g/${linkToken}`);
}

"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createGroup, type CreateGroupRefusal } from "@/group/service";

export type CreateGroupFormState = { refusal?: CreateGroupRefusal };

export async function createGroupAction(
  _previous: CreateGroupFormState,
  form: FormData
): Promise<CreateGroupFormState> {
  const result = await createGroup(getDb(), {
    name: String(form.get("name") ?? ""),
    currency: String(form.get("currency") ?? ""),
    // Rows the organizer left empty aren't members; the service judges the rest.
    memberNames: form
      .getAll("member")
      .map(String)
      .filter((name) => name.trim() !== ""),
  });
  if (!result.ok) return { refusal: result.reason };
  redirect(`/g/${result.view.linkToken}`);
}

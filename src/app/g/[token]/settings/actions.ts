"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import {
  addMember,
  changeCurrency,
  deleteGroup,
  deleteMember,
  renameMember,
  setMemberActive,
  type AddMemberRefusal,
  type ChangeCurrencyRefusal,
  type DeleteGroupRefusal,
  type DeleteMemberRefusal,
  type RenameMemberRefusal,
  type SetMemberActiveRefusal,
} from "@/group/service";

// Each action answers with the service's refusal, or nothing when it worked.
// On success the page is refreshed, so it shows the group as it now is.

function text(form: FormData, field: string): string {
  return String(form.get(field) ?? "");
}

/** Which member, at the version the page showed. */
function memberRef(form: FormData) {
  return { memberId: text(form, "member"), version: groupVersion(form) };
}

function groupVersion(form: FormData): number {
  return Number(text(form, "version"));
}

export async function addMemberAction(
  linkToken: string,
  form: FormData
): Promise<AddMemberRefusal | undefined> {
  const result = await addMember(getDb(), linkToken, {
    name: text(form, "name"),
  });
  if (!result.ok) return result.reason;
  refresh();
}

export async function renameMemberAction(
  linkToken: string,
  form: FormData
): Promise<RenameMemberRefusal | undefined> {
  const result = await renameMember(getDb(), linkToken, {
    ...memberRef(form),
    name: text(form, "name"),
  });
  if (!result.ok) return result.reason;
  refresh();
}

export async function setMemberActiveAction(
  linkToken: string,
  form: FormData
): Promise<SetMemberActiveRefusal | undefined> {
  const result = await setMemberActive(getDb(), linkToken, {
    ...memberRef(form),
    active: text(form, "active") === "true",
  });
  if (!result.ok) return result.reason;
  refresh();
}

export async function deleteMemberAction(
  linkToken: string,
  form: FormData
): Promise<DeleteMemberRefusal | undefined> {
  const result = await deleteMember(getDb(), linkToken, memberRef(form));
  if (!result.ok) return result.reason;
  refresh();
}

export async function changeCurrencyAction(
  linkToken: string,
  form: FormData
): Promise<ChangeCurrencyRefusal | undefined> {
  const result = await changeCurrency(getDb(), linkToken, {
    version: groupVersion(form),
    currency: text(form, "currency"),
  });
  if (!result.ok) return result.reason;
  refresh();
}

/** Deletes the group. The page then forgets it on this device and leaves. */
export async function deleteGroupAction(
  linkToken: string,
  form: FormData
): Promise<DeleteGroupRefusal | undefined> {
  const result = await deleteGroup(getDb(), linkToken, {
    version: groupVersion(form),
  });
  if (!result.ok) return result.reason;
}

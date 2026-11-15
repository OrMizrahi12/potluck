import type { ForeignPartInput } from "@/group/service";

/**
 * The amount field's foreign part, as the group service takes it, or
 * undefined: the field sends a foreign currency only when one other than the
 * group currency is picked.
 */
export function readForeignPartFields(
  form: FormData
): ForeignPartInput | undefined {
  const currency = String(form.get("foreignCurrency") ?? "");
  if (currency === "") return undefined;
  return {
    amount: String(form.get("foreignAmount") ?? ""),
    currency,
    rate: String(form.get("exchangeRate") ?? ""),
  };
}

// PROTOTYPE, throw away. Constants both server and client code read, kept out
// of the "use client" modules so the group page can import them.

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Quiet line",
  B: "Three linked fields",
  C: "Choose how it counts",
};

export function formatRate(rate: number): string {
  return String(Number(rate.toPrecision(6)));
}

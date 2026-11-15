"use client";

// PROTOTYPE, throw away. The floating bar: ← variant →, plus which rate
// lookup outcome to fake. Not part of the design being judged.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SCENARIOS } from "./fake-rates";
import { VARIANTS, VARIANT_NAMES, type Variant } from "./use-conversion";

export function PrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("variant") as Variant | null;
  const scenario = params.get("rates") ?? "ok";
  const on = current !== null && VARIANTS.includes(current);

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  function step(by: number) {
    const i = on ? VARIANTS.indexOf(current) : -1;
    go({ variant: VARIANTS[(i + by + VARIANTS.length) % VARIANTS.length] });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  if (!on) return null;

  const bar: React.CSSProperties = {
    position: "fixed",
    bottom: "0.75rem",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.375rem 0.625rem",
    background: "#111",
    color: "#ffd54f",
    borderRadius: "999px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
    fontSize: "0.85rem",
    zIndex: 1000,
    maxWidth: "calc(100vw - 1rem)",
    flexWrap: "nowrap",
    whiteSpace: "nowrap",
    justifyContent: "center",
    opacity: 0.92,
  };
  const btn: React.CSSProperties = {
    minHeight: "2rem",
    padding: "0 0.6rem",
    background: "transparent",
    color: "inherit",
    border: "1px solid #ffd54f",
    borderRadius: "999px",
  };

  return (
    <div style={bar} aria-label="Prototype switcher">
      <button type="button" style={btn} onClick={() => step(-1)}>
        ←
      </button>
      <strong title={VARIANT_NAMES[current]}>
        {current}
        <span style={{ fontWeight: "normal" }}> {VARIANT_NAMES[current]}</span>
      </strong>
      <button type="button" style={btn} onClick={() => step(1)}>
        →
      </button>
      <select
        aria-label="Fake rate lookup"
        value={scenario}
        onChange={(e) => go({ rates: e.target.value })}
        style={{
          width: "auto",
          minHeight: "2rem",
          maxWidth: "8.5rem",
          padding: "0 0.25rem",
          fontSize: "0.85rem",
          background: "#111",
          color: "inherit",
          border: "1px solid #ffd54f",
          borderRadius: "999px",
        }}
      >
        {SCENARIOS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

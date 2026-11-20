import { describe, expect, it } from "vitest";
import { onlyRow } from "./only-row";

describe("the single row of a query", () => {
  it("is returned from a one-row result", () => {
    expect(onlyRow([{ count: 3 }])).toEqual({ count: 3 });
  });

  it("is missing from an empty result, which throws", () => {
    expect(() => onlyRow([])).toThrow("Expected one row, got 0.");
  });

  it("is ambiguous in a two-row result, which throws", () => {
    expect(() => onlyRow([{ count: 3 }, { count: 4 }])).toThrow(
      "Expected one row, got 2."
    );
  });
});

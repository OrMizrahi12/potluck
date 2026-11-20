/**
 * The single row of a query that always returns exactly one, such as a
 * `count(*)`, a one-row `insert … returning`, or a `select` of a server value.
 * Throws for any other number of rows, so a broken assumption fails loudly at
 * the query.
 */
export function onlyRow<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Expected one row, got ${rows.length}.`);
  }
  return row;
}

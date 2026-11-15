/**
 * 32-bit FNV-1a, written out independently of the engine so tests can check
 * the odd-cent rule against the random ids the service assigns.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, "ascii")) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}

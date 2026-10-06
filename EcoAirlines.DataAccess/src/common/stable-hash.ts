/** Hash FNV-1a de 32 bits: pseudoaleatoriedad determinista (ocupación, retrasos, posiciones de embarque). */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

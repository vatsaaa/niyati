/**
 * Creates a simple, non-cryptographic hash of a string.
 * @param {string} str The string to hash.
 * @returns {string} The hash as a hex string.
 */
export function simpleHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

/** Compares two strings without short-circuiting on the first differing character, so the comparison time does not leak how many leading characters matched. Returns `false` immediately when the lengths differ — length is not treated as secret. Use for pairing secrets, auth tokens, and payload hashes. */
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

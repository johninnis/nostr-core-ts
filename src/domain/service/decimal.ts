const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/

// Deliberate: a leading zero is refused, as the PHP nostr-core reads a decimal field — see shared ADR-0096
/**
 * The integer a canonical string of decimal digits writes — no sign, no leading zero except `0` itself — or `null` for
 * anything else or a value beyond the safe integer range.
 */
export const parseDecimalInteger = (value: string): number | null => {
  if (!CANONICAL_DECIMAL.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

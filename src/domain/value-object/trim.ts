// Deliberate: each trim set written out, never the runtime's own trim — see shared ADR-0002 and shared ADR-0068
const SPACE_AND_NUL_ENDS = /^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g
const UNICODE_WHITESPACE_ENDS = /^[\t\n\v\f\r\p{Zs}\u2028\u2029\uFEFF]+|[\t\n\v\f\r\p{Zs}\u2028\u2029\uFEFF]+$/gu

/**
 * `text` without the space, tab, line feed, carriage return, NUL and vertical tab at its ends: exactly the set PHP's
 * `trim` strips, the set a relay URL is trimmed by (shared ADR-0002), and with it a typed `nostr:` URI and a search.
 */
export const trimSpaceAndNul = (text: string): string => text.replace(SPACE_AND_NUL_ENDS, "")

/**
 * `text` without the Unicode whitespace at its ends — U+0009 to U+000D, every `Zs` space separator, U+2028, U+2029 and
 * U+FEFF — the set a NIP-05 identifier and a zap address are trimmed by (shared ADR-0068).
 */
export const trimUnicodeWhitespace = (text: string): string => text.replace(UNICODE_WHITESPACE_ENDS, "")

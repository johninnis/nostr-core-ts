import { base64 } from "@scure/base"

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/

/**
 * Decode padded RFC 4648 base64, or `null` unless `encoded` is the one canonical encoding of its bytes: the standard
 * alphabet, `=` padding to a multiple of four, and zero bits after the last byte. Never throws: every string the
 * pattern admits is one the decoder accepts.
 */
export const decodeBase64 = (encoded: string): Uint8Array | null =>
  CANONICAL_BASE64.test(encoded) ? base64.decode(encoded) : null

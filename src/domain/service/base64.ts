import { base64, base64urlnopad } from "@scure/base"

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/

const CANONICAL_UNPADDED_BASE64URL =
  /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-][AQgw]|[A-Za-z0-9_-]{2}[AEIMQUYcgkosw048])?$/

/**
 * Decode padded RFC 4648 base64, or `null` unless `encoded` is the one canonical encoding of its bytes: the standard
 * alphabet, `=` padding to a multiple of four, and zero bits after the last byte. Never throws: every string the
 * pattern admits is one the decoder accepts.
 */
export const decodeBase64 = (encoded: string): Uint8Array | null =>
  CANONICAL_BASE64.test(encoded) ? base64.decode(encoded) : null

/**
 * Decode unpadded RFC 4648 base64url, or `null` unless `encoded` is the one canonical unpadded encoding of its bytes:
 * the URL-safe alphabet, no `=` padding, and zero bits after the last byte. Never throws: every string the pattern
 * admits is one the decoder accepts.
 */
export const decodeBase64UrlUnpadded = (encoded: string): Uint8Array | null =>
  CANONICAL_UNPADDED_BASE64URL.test(encoded) ? base64urlnopad.decode(encoded) : null

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/**
 * `encoded`, canonical padded base64, with the lowest unused bit of its last character set: the same bytes to a lenient
 * decoder, and no canonical encoding of them.
 */
export const withTrailingBitSet = (encoded: string): string => {
  const last = encoded.replace(/=+$/, "").length - 1
  const next = BASE64_ALPHABET.charAt(BASE64_ALPHABET.indexOf(encoded.charAt(last)) + 1)
  return `${encoded.slice(0, last)}${next}${encoded.slice(last + 1)}`
}

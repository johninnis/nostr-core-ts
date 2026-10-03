/**
 * Shared module-level `TextEncoder` and `TextDecoder` singletons. Safe to reuse because the
 * default (non-streaming, UTF-8) instances are stateless across `encode()`/`decode()` calls.
 *
 * `textEncoder` encodes every string the library turns into UTF-8 bytes. `textDecoder` is lossy (it
 * strips a byte order mark and replaces invalid bytes with U+FFFD), and decodes only display text: an
 * HTTP body read through `text()` and an error body's message. Untrusted bytes that must be read
 * exactly as written, or refused, go through `decodeUtf8`: NIP-19 TLV text records, LNURL payloads,
 * the NIP-98 header, decrypted NIP-04 and NIP-44 plaintext, and an HTTP body read through `json()`
 * (ADR-0004).
 */
export const textEncoder: TextEncoder = new TextEncoder()
export const textDecoder: TextDecoder = new TextDecoder()

const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

/**
 * `bytes` read as UTF-8, exactly as written (a byte order mark is kept as U+FEFF), or `null` when they are not valid
 * UTF-8: untrusted bytes are refused, never decoded lossily with replacement characters.
 */
export const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return strictUtf8Decoder.decode(bytes)
  } catch {
    return null
  }
}

/**
 * `true` when `text` encodes to more than `limit` UTF-8 bytes. A string longer than `limit` in UTF-16 code units is
 * over it without being encoded, since every code unit is at least one byte; one of at most a third of `limit` is under
 * it, since none is more than three.
 */
export const exceedsUtf8Bytes = (text: string, limit: number): boolean =>
  text.length > limit || (text.length * 3 > limit && textEncoder.encode(text).length > limit)

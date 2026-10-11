import { sha256 } from "@noble/hashes/sha2"
import { formatHex } from "./hex.ts"
import { textEncoder } from "./text-codec.ts"

const bytesOf = (data: string | ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (typeof data === "string") return textEncoder.encode(data)
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
}

// Deliberate: noble only, synchronously, with no WebCrypto path — see ADR-0013
/**
 * The 32-byte SHA-256 digest of `bytes`, for a hash whose digest is hashed or read as bytes again, as Cashu's
 * `hash_to_curve` does. Synchronous; the one SHA-256 {@link sha256Hex} also writes.
 */
export const sha256Digest = (bytes: Uint8Array): Uint8Array => sha256(bytes)

/**
 * Lowercase hex SHA-256 of `data`: the UTF-8 encoding of a string, or the bytes a buffer or view holds. Synchronous;
 * runs anywhere, including insecure browser contexts without WebCrypto.
 */
export const sha256Hex = (data: string | ArrayBuffer | ArrayBufferView): string =>
  formatHex(sha256Digest(bytesOf(data)))

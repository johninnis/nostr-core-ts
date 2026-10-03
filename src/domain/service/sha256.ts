import { sha256 } from "@noble/hashes/sha2"
import { formatHex } from "./hex.ts"
import { textEncoder } from "./text-codec.ts"

const bytesOf = (data: string | ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (typeof data === "string") return textEncoder.encode(data)
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
}

// Deliberate: noble only, synchronously, with no WebCrypto path — see ADR-0013
/**
 * Lowercase hex SHA-256 of `data`: the UTF-8 encoding of a string, or the bytes a buffer or view holds. Synchronous;
 * runs anywhere, including insecure browser contexts without WebCrypto.
 */
export const sha256Hex = (data: string | ArrayBuffer | ArrayBufferView): string => formatHex(sha256(bytesOf(data)))

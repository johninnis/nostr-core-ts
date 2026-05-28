import { sha256 } from "@noble/hashes/sha2"
import { formatHex } from "../value-object/hex.ts"
import { textEncoder } from "../value-object/text-codec.ts"

const toBytes = (data: BufferSource): Uint8Array =>
  ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)

/** Lowercase hex SHA-256 of `data`; uses `crypto.subtle` when available, otherwise a pure-JS fallback. */
export const computeSha256 = async (data: BufferSource): Promise<string> => {
  // crypto.subtle is only exposed in secure contexts (HTTPS / localhost). A browser
  // running this lib over plain http:// has crypto.subtle === undefined, so the noble
  // fallback below is what actually runs there. Don't delete it.
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    return formatHex(new Uint8Array(hashBuffer))
  }
  return formatHex(sha256(toBytes(data)))
}

/** Lowercase hex SHA-256 of the UTF-8 encoding of `input`. */
export const sha256Hex = async (input: string): Promise<string> => computeSha256(textEncoder.encode(input))

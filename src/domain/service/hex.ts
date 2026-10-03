import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { isLowercaseHex } from "../value-object/brand.ts"
import type { EventId } from "../value-object/event-id.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Sig } from "../value-object/sig.ts"

/**
 * Decode `raw` lowercase hex to bytes, or `null` when it has odd length or any character that is not lowercase hex.
 * Never throws.
 */
export const parseHex = (raw: string): Uint8Array | null =>
  raw.length % 2 === 0 && isLowercaseHex(raw, raw.length) ? hexToBytes(raw) : null

/** The bytes of a hex brand, which is valid hex by construction; a throw here is a broken invariant. */
export const brandBytes: (hex: PublicKey | EventId | Sig) => Uint8Array = hexToBytes

/** Encode `bytes` to lowercase hex: `@noble/hashes`' encoder, the counterpart of {@link parseHex}. */
export const formatHex: (bytes: Uint8Array) => string = bytesToHex

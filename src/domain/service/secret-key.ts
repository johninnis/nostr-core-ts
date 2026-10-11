import { secp256k1 } from "@noble/curves/secp256k1"
import { parseHex } from "./hex.ts"

/** `true` exactly when `bytes` are 32 bytes holding a secp256k1 scalar from 1 to n − 1, the only form a secret key takes. */
export const isValidSecretKey = (bytes: Uint8Array): boolean => secp256k1.utils.isValidSecretKey(bytes)

// Deliberate: a secret key is read only as lowercase hex of a scalar from 1 to n − 1, never case-folded or reduced mod n — see shared ADR-0088
/**
 * Read untrusted hex as a secret key: the 32 bytes that 64 lowercase hex characters spell when they hold a secp256k1
 * scalar from 1 to n − 1, or `null` for anything else — upper-case hex, any other length, zero, or n and above, which
 * is never reduced mod n. Never throws. `createLocalSigner` and the NIP-04 / NIP-44 codecs throw `InvalidArgumentError`
 * for exactly the key bytes this refuses, because there a key is the caller's own argument rather than untrusted input.
 */
export const parseSecretKey = (raw: string): Uint8Array | null => {
  const bytes = parseHex(raw)
  return bytes !== null && isValidSecretKey(bytes) ? bytes : null
}

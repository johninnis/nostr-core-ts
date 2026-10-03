import { secp256k1 } from "@noble/curves/secp256k1"
import { concatBytes } from "@noble/hashes/utils"
import { brandBytes } from "../../domain/service/hex.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"

const EVEN_Y_PREFIX = 0x02

// Deliberate: the vendored NIP-44 codec keeps its own ECDH step; do not route it through here — see ADR-0016
/** Compute the secp256k1 ECDH shared X coordinate between `secretKey` and `peerPubkey` (the NIP-04 shared secret). */
export const sharedX = (secretKey: Uint8Array, peerPubkey: PublicKey): Uint8Array => {
  const compressed = concatBytes(Uint8Array.of(EVEN_Y_PREFIX), brandBytes(peerPubkey))
  return secp256k1.getSharedSecret(secretKey, compressed).subarray(1, 33)
}

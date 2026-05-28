import { secp256k1 } from "@noble/curves/secp256k1"
import { parseHex } from "../../domain/value-object/hex.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"

// Used by the NIP-04 adapter. The vendored NIP-44 v2 codec (`infrastructure/crypto/nip44-v2.ts`)
// deliberately inlines its own ECDH step to keep the vendor file byte-identical to upstream — do
// not "unify" them by routing nip44-v2 through this helper.
/** Compute the secp256k1 ECDH shared X coordinate between `secretKey` and `peerPubkey` (NIP-04/44 shared secret). */
export const sharedX = (secretKey: Uint8Array, peerPubkey: PublicKey): Uint8Array => {
  const peer = parseHex(peerPubkey)
  const compressed = new Uint8Array(33)
  compressed[0] = 0x02
  compressed.set(peer, 1)
  return secp256k1.getSharedSecret(secretKey, compressed).subarray(1, 33)
}

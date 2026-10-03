import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex } from "@noble/hashes/utils"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { publicKeyFixture } from "../../testing.ts"

/** A fixed secp256k1 key pair: the secret key bytes and the x-only public key they produce. */
export interface KeyPair {
  readonly sk: Uint8Array
  readonly pk: PublicKey
}

/** The fixed secret key whose last byte is `seed` (1–255) and whose other bytes are zero, a valid secp256k1 scalar. */
export const secretKeyOf = (seed: number): Uint8Array => {
  const sk = new Uint8Array(32)
  sk[31] = seed
  return sk
}

/** The fixed key pair of {@link secretKeyOf}(`seed`). */
export const keyPairOf = (seed: number): KeyPair => {
  const sk = secretKeyOf(seed)
  return { sk, pk: publicKeyFixture(bytesToHex(schnorr.getPublicKey(sk))) }
}

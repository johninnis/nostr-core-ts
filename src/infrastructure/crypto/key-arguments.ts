import { secp256k1 } from "@noble/curves/secp256k1"
import { InvalidArgumentError } from "../../domain/exception/invalid-argument-error.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { isValidPublicKey } from "../../domain/value-object/public-key.ts"

const CONVERSATION_KEY_BYTES = 32

/** Throw `InvalidArgumentError` unless `secretKey` is 32 bytes holding a secp256k1 scalar from 1 to n − 1. */
export const assertSecretKey = (secretKey: Uint8Array): void => {
  if (!secp256k1.utils.isValidSecretKey(secretKey)) {
    throw new InvalidArgumentError("A secret key is 32 bytes holding a secp256k1 scalar from 1 to n - 1")
  }
}

/** Throw `InvalidArgumentError` unless `peerPubkey` is a `PublicKey`: 64 lowercase hex characters. */
export const assertPeerPubkey = (peerPubkey: PublicKey): void => {
  if (!isValidPublicKey(peerPubkey)) {
    throw new InvalidArgumentError(`A peer public key is 64 lowercase hex characters, not "${String(peerPubkey)}"`)
  }
}

/** Throw `InvalidArgumentError` unless `conversationKey` is the 32 bytes a NIP-44 v2 conversation key is. */
export const assertConversationKey = (conversationKey: Uint8Array): void => {
  if (!(conversationKey instanceof Uint8Array) || conversationKey.length !== CONVERSATION_KEY_BYTES) {
    throw new InvalidArgumentError("A NIP-44 v2 conversation key is 32 bytes")
  }
}

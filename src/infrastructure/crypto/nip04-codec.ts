import { cbc } from "@noble/ciphers/aes"
import { base64 } from "@scure/base"
import { decodeBase64 } from "../../domain/service/base64.ts"
import { Nip04CryptoError } from "../../domain/exception/nip04-crypto-error.ts"
import { randomBytes } from "../../domain/service/random.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { decodeUtf8, exceedsUtf8Bytes, textEncoder } from "../../domain/service/text-codec.ts"
import { NIP04_IV_SEPARATOR } from "../../domain/service/cipher-scheme.ts"
import { assertPeerPubkey, assertSecretKey } from "./key-arguments.ts"
import { refusedAs } from "./codec-refusal.ts"
import { sharedX } from "./shared-x.ts"

const IV_LEN = 16
const MAX_PLAINTEXT_BYTES = 65567

// Deliberate: encryption writes no payload over the 87472 characters decryption reads — see shared ADR-0018
/**
 * NIP-04 encrypt: AES-256-CBC of `plaintext` with the ECDH shared secret; returns `<ct>?iv=<iv>` base64. Synchronous.
 * Throws `Nip04CryptoError` when `peerPubkey` is not a secp256k1 point, `plaintext` holds a lone surrogate (it has no
 * UTF-8 encoding, shared ADR-0100) or `plaintext` is over 65567 UTF-8 bytes, the most whose payload
 * {@link nip04Decrypt} reads, and `InvalidArgumentError` when `secretKey` is not 32 bytes holding a
 * secp256k1 scalar or `peerPubkey` is not 64 lowercase hex characters. NIP-04 is unauthenticated and deprecated —
 * present for legacy interop only; new code uses NIP-44.
 */
export const nip04Encrypt = (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: string): string => {
  assertSecretKey(secretKey)
  assertPeerPubkey(peerPubkey)
  if (!plaintext.isWellFormed()) throw new Nip04CryptoError("NIP-04 plaintext must be UTF-8: it holds a lone surrogate")
  if (exceedsUtf8Bytes(plaintext, MAX_PLAINTEXT_BYTES)) {
    throw new Nip04CryptoError(`NIP-04 plaintext must be at most ${MAX_PLAINTEXT_BYTES} bytes`)
  }
  const key = refusedAs(
    () => sharedX(secretKey, peerPubkey),
    (cause) => new Nip04CryptoError("NIP-04 encryption failed", { cause }),
  )
  const iv = randomBytes(IV_LEN)
  const ciphertext = cbc(key, iv).encrypt(textEncoder.encode(plaintext))
  return `${base64.encode(ciphertext)}${NIP04_IV_SEPARATOR}${base64.encode(iv)}`
}

const MIN_PAYLOAD_LENGTH = 52
const MAX_PAYLOAD_LENGTH = 87472

const failed = (): Nip04CryptoError => new Nip04CryptoError("NIP-04 decryption failed")

const decryptPayload = (secretKey: Uint8Array, peerPubkey: PublicKey, payload: string): Uint8Array => {
  const key = refusedAs(() => sharedX(secretKey, peerPubkey), failed)
  const sep = payload.indexOf(NIP04_IV_SEPARATOR)
  const ciphertext = sep === -1 ? null : decodeBase64(payload.slice(0, sep))
  const iv = sep === -1 ? null : decodeBase64(payload.slice(sep + NIP04_IV_SEPARATOR.length))
  if (ciphertext === null || iv?.length !== IV_LEN) throw failed()
  return refusedAs(() => cbc(key, iv).decrypt(ciphertext), failed)
}

// Deliberate: every malformed or undecryptable payload throws the same failure, bounded before any work — see ADR-0021
/**
 * NIP-04 decrypt: inverse of {@link nip04Encrypt}. Throws `Nip04CryptoError` with the one message `NIP-04 decryption
 * failed` for every payload it cannot decrypt — outside 52–87472 characters, no `?iv=`, bad base64, a wrong-length IV,
 * an AES-CBC failure, a plaintext that is not valid UTF-8, or a sender key that is not a secp256k1 point. The plaintext
 * is read exactly as written, a leading byte order mark kept (shared ADR-0100). A `secretKey` that is not 32 bytes
 * holding a secp256k1 scalar, or a `peerPubkey` that is not 64 lowercase hex characters, is misuse, not a payload it
 * refuses, and throws `InvalidArgumentError`. NIP-04 has no MAC, so a wrong key may instead yield garbage plaintext.
 * Synchronous.
 */
export const nip04Decrypt = (secretKey: Uint8Array, peerPubkey: PublicKey, payload: string): string => {
  assertSecretKey(secretKey)
  assertPeerPubkey(peerPubkey)
  if (payload.length < MIN_PAYLOAD_LENGTH || payload.length > MAX_PAYLOAD_LENGTH) throw failed()
  const plaintext = decodeUtf8(decryptPayload(secretKey, peerPubkey, payload))
  if (plaintext === null) throw failed()
  return plaintext
}

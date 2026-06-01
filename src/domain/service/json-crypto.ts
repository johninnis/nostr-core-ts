import { tryParseJson } from "../value-object/json.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { PeerCipher } from "./peer-cipher.ts"
import type { SignerError } from "../exception/signer-error.ts"
import { JsonCryptoError } from "../exception/json-crypto-error.ts"
import { errorMessage } from "./error-utils.ts"

type EncryptToPeer = (pubkey: PublicKey, plaintext: string) => Promise<Result<string, SignerError>>
type DecryptFromPeer = (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>

const encryptJsonVia = async (
  encrypt: EncryptToPeer,
  pubkey: PublicKey,
  value: unknown,
): Promise<Result<string, JsonCryptoError>> => {
  let json: string
  try {
    json = JSON.stringify(value)
  } // deno-lint-ignore innis/no-catch-in-layer -- JSON.stringify throws on circular references
  catch (err) {
    return failure(
      new JsonCryptoError("json-stringify-failed", `value is not serialisable as JSON: ${errorMessage(err)}`, err),
    )
  }
  const encrypted = await encrypt(pubkey, json)
  if (!encrypted.success) {
    return failure(new JsonCryptoError("signer-failed", encrypted.error.message, encrypted.error))
  }
  return ok(encrypted.value)
}

const decryptJsonVia = async (
  decrypt: DecryptFromPeer,
  pubkey: PublicKey,
  ciphertext: string,
): Promise<Result<unknown, JsonCryptoError>> => {
  if (!ciphertext) return failure(new JsonCryptoError("empty-ciphertext", "ciphertext is empty"))
  const decrypted = await decrypt(pubkey, ciphertext)
  if (!decrypted.success) {
    return failure(new JsonCryptoError("signer-failed", decrypted.error.message, decrypted.error))
  }
  const parsed = tryParseJson(decrypted.value)
  if (parsed === null) {
    return failure(new JsonCryptoError("json-parse-failed", "decrypted payload could not be parsed as JSON"))
  }
  return ok(parsed)
}

/**
 * JSON-serialise `value` and NIP-44 encrypt it to `pubkey` via `cipher`; non-serialisable values
 * fail with `json-stringify-failed`. The default JSON-over-NIP-44 path — prefer it over
 * `nip04EncryptJson`, which exists only for legacy peers that cannot do NIP-44.
 */
export const encryptJson = (
  cipher: PeerCipher,
  pubkey: PublicKey,
  value: unknown,
): Promise<Result<string, JsonCryptoError>> =>
  encryptJsonVia((pk, plaintext) => cipher.nip44Encrypt(pk, plaintext), pubkey, value)

/** Like `encryptJson` but over NIP-04, for legacy peers that cannot do NIP-44. New code should use `encryptJson`. */
export const nip04EncryptJson = (
  cipher: PeerCipher,
  pubkey: PublicKey,
  value: unknown,
): Promise<Result<string, JsonCryptoError>> =>
  encryptJsonVia((pk, plaintext) => cipher.nip04Encrypt(pk, plaintext), pubkey, value)

/**
 * NIP-44 decrypt `ciphertext` from `pubkey` via `cipher` and JSON-parse the plaintext; empty or
 * non-JSON payloads fail with a `JsonCryptoError`. Note: a successful parse to the literal value
 * `null` (e.g. the plaintext was exactly `"null"`) is treated as a parse failure — Nostr application
 * payloads are objects and arrays, never bare `null`. The default JSON-over-NIP-44 path.
 */
export const decryptJson = (
  cipher: PeerCipher,
  pubkey: PublicKey,
  ciphertext: string,
): Promise<Result<unknown, JsonCryptoError>> =>
  decryptJsonVia((pk, ct) => cipher.nip44Decrypt(pk, ct), pubkey, ciphertext)

/** Like `decryptJson` but over NIP-04, for envelopes from legacy peers. New code should use `decryptJson`. */
export const nip04DecryptJson = (
  cipher: PeerCipher,
  pubkey: PublicKey,
  ciphertext: string,
): Promise<Result<unknown, JsonCryptoError>> =>
  decryptJsonVia((pk, ct) => cipher.nip04Decrypt(pk, ct), pubkey, ciphertext)

import { tryParseJson } from "../value-object/json.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { Signer } from "./signer.ts"
import { JsonCryptoError } from "../exception/json-crypto-error.ts"
import { errorMessage } from "./error-utils.ts"

/** JSON-serialise `value` and NIP-44 encrypt it with `signer`; non-serialisable values fail with `json-stringify-failed`. */
export const encryptJson = async (
  signer: Signer,
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
  const encrypted = await signer.nip44Encrypt(pubkey, json)
  if (!encrypted.success) {
    return failure(new JsonCryptoError("signer-failed", encrypted.error.message, encrypted.error))
  }
  return ok(encrypted.value)
}

/**
 * NIP-44 decrypt with `signer` and JSON-parse the plaintext; empty or non-JSON payloads fail with
 * a `JsonCryptoError`. Note: a successful parse to the literal value `null` (e.g. the plaintext
 * was exactly `"null"`) is treated as a parse failure — Nostr application payloads are objects
 * and arrays, never bare `null`.
 */
export const decryptJson = async (
  signer: Signer,
  pubkey: PublicKey,
  ciphertext: string,
): Promise<Result<unknown, JsonCryptoError>> => {
  if (!ciphertext) return failure(new JsonCryptoError("empty-ciphertext", "ciphertext is empty"))
  const decrypted = await signer.nip44Decrypt(pubkey, ciphertext)
  if (!decrypted.success) {
    return failure(new JsonCryptoError("signer-failed", decrypted.error.message, decrypted.error))
  }
  const parsed = tryParseJson(decrypted.value)
  if (parsed === null) {
    return failure(new JsonCryptoError("json-parse-failed", "decrypted payload could not be parsed as JSON"))
  }
  return ok(parsed)
}

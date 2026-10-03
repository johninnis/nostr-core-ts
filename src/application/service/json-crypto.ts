import { parseJson } from "../../domain/service/json.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure } from "../../domain/value-object/result.ts"
import type { PeerCipher, PeerCipherFn } from "../../domain/service/peer-cipher.ts"
import type { JsonDecryptFailure } from "../failure/json-decrypt-failure.ts"
import type { SignerFailure } from "../../domain/failure/signer-failure.ts"
import type { CipherScheme } from "../../domain/service/cipher-scheme.ts"
import type { JsonSerialisable, JsonValue } from "../../domain/value-object/json-serialisable.ts"
import { InvalidArgumentError } from "../../domain/exception/invalid-argument-error.ts"

const decryptJsonVia = async (
  decrypt: PeerCipherFn,
  pubkey: PublicKey,
  ciphertext: string,
): Promise<Result<JsonValue, JsonDecryptFailure>> => {
  if (!ciphertext) return failure({ type: "empty-ciphertext" })
  const decrypted = await decrypt(pubkey, ciphertext)
  if (!decrypted.success) return failure({ type: "signer-failed", cause: decrypted.error })
  const parsed = parseJson(decrypted.value)
  return parsed.success ? parsed : failure({ type: "json-parse-failed" })
}

/** JSON round-tripped to and from peers over one cipher and one scheme; built by `createJsonCipher`. */
export interface JsonCipher {
  /**
   * JSON-serialise `value` and encrypt it to `pubkey`, failing only with the signer's own `SignerFailure`. A value that
   * is no JSON is refused by the type and, past a cast, is a programmer fault: `undefined` or a function, for which
   * `JSON.stringify` writes nothing, throws an `InvalidArgumentError` before the signer is asked, and a bigint or a
   * cycle throws `JSON.stringify`'s own `TypeError`.
   */
  readonly encrypt: <T>(pubkey: PublicKey, value: T & JsonSerialisable<T>) => Promise<Result<string, SignerFailure>>
  /**
   * Decrypt `ciphertext` from `pubkey` and JSON-parse it. Any well-formed JSON succeeds, the literal `null` included —
   * callers validate the shape. Empty or non-JSON payloads fail with a `JsonDecryptFailure`.
   */
  readonly decrypt: (pubkey: PublicKey, ciphertext: string) => Promise<Result<JsonValue, JsonDecryptFailure>>
}

// Deliberate: NIP-04 is an explicit opt-in, never an automatic fallback from NIP-44 — see ADR-0012
/** JSON over `cipher` under `scheme`: NIP-44 unless NIP-04 is asked for, for a legacy peer. */
export const createJsonCipher = (cipher: PeerCipher, scheme: CipherScheme = "nip44"): JsonCipher => ({
  encrypt: async (pubkey, value) => {
    const plaintext: string | undefined = JSON.stringify(value)
    if (plaintext === undefined) throw new InvalidArgumentError(`JSON.stringify writes nothing for ${typeof value}`)
    return await (scheme === "nip04" ? cipher.nip04Encrypt(pubkey, plaintext) : cipher.nip44Encrypt(pubkey, plaintext))
  },
  decrypt: (pubkey, ciphertext) =>
    decryptJsonVia(
      (pk, text) => scheme === "nip04" ? cipher.nip04Decrypt(pk, text) : cipher.nip44Decrypt(pk, text),
      pubkey,
      ciphertext,
    ),
})

import { cbc } from "@noble/ciphers/aes"
import { base64 } from "@scure/base"
import { Nip04DecryptError } from "../../domain/exception/nip04-decrypt-error.ts"
import { errorMessage } from "../../domain/service/error-utils.ts"
import { randomBytes } from "../../domain/service/random.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { textDecoder, textEncoder } from "../../domain/value-object/text-codec.ts"
import { sharedX } from "../crypto/shared-x.ts"

const IV_LEN = 16

// `crypto.subtle.{import,en,de}cryptKey` insist on a fresh `Uint8Array<ArrayBuffer>` (not a
// `SharedArrayBuffer`-backed view) — `.slice()` gives us one with its own ArrayBuffer backing.
const toOwnedArray = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => bytes.slice()

// `crypto.subtle` is only exposed in secure contexts (HTTPS / localhost) and is absent from some
// non-browser runtimes. Resolved PER CALL (not once at module load) so a page served over plain
// HTTP — or any host that mutates `globalThis.crypto.subtle` post-load — falls through to the
// noble-`cbc` fallback. The JS fallback is wire-compatible (verified by the spec-vector tests),
// and per-call resolution doubles as the seam the test suite uses to exercise the fallback path.
const subtleCrypto = (): SubtleCrypto | undefined => typeof crypto !== "undefined" ? crypto.subtle : undefined

const encryptAesCbc = async (key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> => {
  const subtle = subtleCrypto()
  if (subtle) {
    const cryptoKey = await subtle.importKey("raw", toOwnedArray(key), { name: "AES-CBC" }, false, ["encrypt"])
    return new Uint8Array(
      await subtle.encrypt({ name: "AES-CBC", iv: toOwnedArray(iv) }, cryptoKey, toOwnedArray(plaintext)),
    )
  }
  return cbc(key, iv).encrypt(plaintext)
}

const decryptAesCbc = async (key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> => {
  const subtle = subtleCrypto()
  if (subtle) {
    const cryptoKey = await subtle.importKey("raw", toOwnedArray(key), { name: "AES-CBC" }, false, ["decrypt"])
    return new Uint8Array(
      await subtle.decrypt({ name: "AES-CBC", iv: toOwnedArray(iv) }, cryptoKey, toOwnedArray(ciphertext)),
    )
  }
  return cbc(key, iv).decrypt(ciphertext)
}

/**
 * NIP-04 (legacy AES-CBC) is unauthenticated and malleable; new code should prefer NIP-44.
 *
 * **Deprecated for new applications — present only for legacy interop.** Strangers can flip bits
 * in the ciphertext and the receiver has no way to detect it. NIP-44 v2 (chacha20+hmac) is the
 * sanctioned encryption path; see {@link nip44Encrypt}/{@link nip44Decrypt} on `Signer`.
 */

/** NIP-04 encrypt: AES-256-CBC of `plaintext` with the ECDH shared secret; returns `<ct>?iv=<iv>` base64. */
export const nip04Encrypt = async (
  secretKey: Uint8Array,
  peerPubkey: PublicKey,
  plaintext: string,
): Promise<string> => {
  const iv = randomBytes(IV_LEN)
  const key = sharedX(secretKey, peerPubkey)
  const ciphertext = await encryptAesCbc(key, iv, textEncoder.encode(plaintext))
  return `${base64.encode(ciphertext)}?iv=${base64.encode(iv)}`
}

// `@scure/base#base64.decode` throws a plain `Error` on malformed input. Remap to the
// adapter's domain-typed `Nip04DecryptError` so direct callers see one error type for every
// "malformed payload" reason. `field` tells the caller which half (ciphertext vs iv) was bad.
const decodeBase64Part = (raw: string, field: "ciphertext" | "iv"): Uint8Array => {
  try {
    return base64.decode(raw)
  } catch (error) {
    throw new Nip04DecryptError(`invalid base64 in ${field}: ${errorMessage(error)}`, error)
  }
}

/**
 * NIP-04 decrypt: inverse of {@link nip04Encrypt}; throws `Nip04DecryptError` on a malformed
 * payload, wrong IV length, or AES-CBC failure (typically wrong key — NIP-04 has no MAC, so a
 * wrong-key decrypt may also silently succeed and yield garbage plaintext).
 */
export const nip04Decrypt = async (
  secretKey: Uint8Array,
  peerPubkey: PublicKey,
  payload: string,
): Promise<string> => {
  const sep = payload.indexOf("?iv=")
  if (sep === -1) throw new Nip04DecryptError("missing ?iv= separator")
  const ciphertext = decodeBase64Part(payload.slice(0, sep), "ciphertext")
  const iv = decodeBase64Part(payload.slice(sep + 4), "iv")
  if (iv.length !== IV_LEN) throw new Nip04DecryptError(`invalid iv length: expected ${IV_LEN}, got ${iv.length}`)
  const key = sharedX(secretKey, peerPubkey)
  let plaintext: Uint8Array
  try {
    plaintext = await decryptAesCbc(key, iv, ciphertext)
  } catch (error) {
    throw new Nip04DecryptError(`AES-CBC decrypt failed: ${errorMessage(error)}`, error)
  }
  return textDecoder.decode(plaintext)
}

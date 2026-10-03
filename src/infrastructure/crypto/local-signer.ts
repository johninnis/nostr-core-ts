import { schnorr } from "@noble/curves/secp256k1"
import type { SignerFailure } from "../../domain/failure/signer-failure.ts"
import { Nip04CryptoError } from "../../domain/exception/nip04-crypto-error.ts"
import { Nip44CryptoError } from "../../domain/exception/nip44-crypto-error.ts"
import { buildRumour } from "../../domain/service/rumour.ts"
import type { Signer } from "../../domain/service/signer.ts"
import type { EventId } from "../../domain/value-object/event-id.ts"
import { brandBytes, formatHex } from "../../domain/service/hex.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { parsePublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { Sig } from "../../domain/value-object/sig.ts"
import { parseSig } from "../../domain/value-object/sig.ts"
import { assertSecretKey } from "./key-arguments.ts"
import { nip04Decrypt, nip04Encrypt } from "./nip04-codec.ts"
import { getNip44ConversationKey, nip44Decrypt, nip44Encrypt } from "./nip44-codec.ts"
import { InvariantError } from "../../domain/exception/invariant-error.ts"

/**
 * The crypto primitives `createLocalSigner` runs on the secret key it holds. {@link defaultLocalSignerTools} uses
 * `@noble/curves` for Schnorr and this package's NIP-04 and NIP-44 codecs; a test passes its own to observe or fail a
 * step. Every primitive receives the key bytes, so the key must be in memory: a key that never leaves a device signs
 * through a `Signer` of its own, not through these tools.
 *
 * NIP-44 is split into deriving the conversation key (`getNip44ConversationKey`, ECDH and HKDF-extract, the costly
 * step) and the cipher over that key (`nip44Encrypt` / `nip44Decrypt`), so `createLocalSigner` derives each peer's key
 * once and keeps it for later calls. NIP-04 takes the secret key and the peer's pubkey on every call. A cipher tool
 * reports a payload or peer key it cannot use by throwing `Nip04CryptoError` or `Nip44CryptoError`, as the codecs do.
 */
export interface LocalSignerTools {
  readonly getPublicKey: (secretKey: Uint8Array) => PublicKey
  readonly schnorrSign: (id: EventId, secretKey: Uint8Array) => Sig
  readonly nip04Encrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: string) => string
  readonly nip04Decrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, ciphertext: string) => string
  readonly getNip44ConversationKey: (secretKey: Uint8Array, peerPubkey: PublicKey) => Uint8Array
  readonly nip44Encrypt: (conversationKey: Uint8Array, plaintext: string) => string
  readonly nip44Decrypt: (conversationKey: Uint8Array, ciphertext: string) => string
}

/** Generate a fresh 32-byte secp256k1 secret key suitable for use with `createLocalSigner`. */
export const generateSecretKey = (): Uint8Array => schnorr.utils.randomSecretKey()

const getPublicKey = (secretKey: Uint8Array): PublicKey => {
  const pubkey = parsePublicKey(formatHex(schnorr.getPublicKey(secretKey)))
  if (pubkey === null) throw new InvariantError("secp256k1 produced a public key that is not 32 bytes")
  return pubkey
}

const schnorrSign = (id: EventId, secretKey: Uint8Array): Sig => {
  const sig = parseSig(formatHex(schnorr.sign(brandBytes(id), secretKey)))
  if (sig === null) throw new InvariantError("Schnorr produced a signature that is not 64 bytes")
  return sig
}

/**
 * The `LocalSignerTools` `createLocalSigner` uses by default: `@noble/curves` Schnorr and this package's NIP-04 and
 * NIP-44 codecs.
 */
export const defaultLocalSignerTools: LocalSignerTools = {
  getPublicKey,
  schnorrSign,
  nip04Encrypt,
  nip04Decrypt,
  getNip44ConversationKey,
  nip44Encrypt,
  nip44Decrypt,
}

const CONVERSATION_KEY_CACHE_SIZE = 128

const settle = <T>(compute: () => T): Promise<T> => new Promise((resolve) => resolve(compute()))

// Deliberate: only the codecs' own errors become a failure; any other throw is a fault and propagates — see ADR-0008
const tryOk = (type: SignerFailure["type"], fn: () => string): Promise<Result<string, SignerFailure>> =>
  settle(() => {
    try {
      return ok(fn())
    } catch (error) {
      if (error instanceof Nip04CryptoError || error instanceof Nip44CryptoError) {
        return failure({ type, message: error.message })
      }
      throw error
    }
  })

/**
 * Construct a `Signer` backed by an in-memory secret key plus the pure-crypto primitives in `tools`. The corresponding
 * public key is derived from `secretKey` via `tools.getPublicKey`. Each call builds an independent `Signer` that keeps
 * the NIP-44 conversation keys of its 128 most recently used peers, so repeated encrypts and decrypts with one peer run
 * ECDH and HKDF-extract once. A key is kept only once a cipher over it has succeeded, so a payload that fails to
 * decrypt leaves nothing behind, and the bound holds however many peers write to it, the throwaway key of every gift
 * wrap among them.
 *
 * `getPublicKey` and `signEvent` always succeed: the signer holds its key. `signEvent` signs the template's four NIP-01
 * fields and no other key it carries. A cipher method returns `encrypt-failed` or `decrypt-failed` when its tool throws
 * the codec's `Nip04CryptoError` or `Nip44CryptoError`. Any other throw from a tool — `tools.schnorrSign` included — is
 * a broken primitive, not an outcome, and rejects the returned promise. A template that is not a NIP-01 event — its
 * `kind` or `created_at` one `parseNostrEvent` would refuse — is the caller's fault: `buildRumour` refuses it, as
 * `buildUnsignedEvent` does for every `Signer`, and `signEvent` rejects with `InvalidArgumentError` before any tool
 * signs. A `secretKey` that is not 32 bytes holding a secp256k1 scalar from 1 to n − 1 is the caller's fault too: it
 * throws `InvalidArgumentError` before any tool runs.
 */
export const createLocalSigner = (secretKey: Uint8Array, tools: LocalSignerTools = defaultLocalSignerTools): Signer => {
  assertSecretKey(secretKey)
  const pubkey = tools.getPublicKey(secretKey)
  const conversationKeys = new Map<PublicKey, Uint8Array>()

  const withConversationKey = (peerPubkey: PublicKey, cipher: (conversationKey: Uint8Array) => string): string => {
    const conversationKey = conversationKeys.get(peerPubkey) ?? tools.getNip44ConversationKey(secretKey, peerPubkey)
    const text = cipher(conversationKey)
    conversationKeys.delete(peerPubkey)
    conversationKeys.set(peerPubkey, conversationKey)
    const leastRecent = conversationKeys.keys().next().value
    if (conversationKeys.size > CONVERSATION_KEY_CACHE_SIZE && leastRecent !== undefined) {
      conversationKeys.delete(leastRecent)
    }
    return text
  }

  return {
    kind: "local",
    getPublicKey: () => Promise.resolve(ok(pubkey)),
    signEvent: (event) =>
      settle(() => {
        const rumour = buildRumour({ ...event, pubkey })
        return ok({ ...rumour, sig: tools.schnorrSign(rumour.id, secretKey) })
      }),
    nip04Encrypt: (peerPubkey, plaintext) =>
      tryOk("encrypt-failed", () => tools.nip04Encrypt(secretKey, peerPubkey, plaintext)),
    nip04Decrypt: (peerPubkey, ciphertext) =>
      tryOk("decrypt-failed", () => tools.nip04Decrypt(secretKey, peerPubkey, ciphertext)),
    nip44Encrypt: (peerPubkey, plaintext) =>
      tryOk("encrypt-failed", () => withConversationKey(peerPubkey, (key) => tools.nip44Encrypt(key, plaintext))),
    nip44Decrypt: (peerPubkey, ciphertext) =>
      tryOk("decrypt-failed", () => withConversationKey(peerPubkey, (key) => tools.nip44Decrypt(key, ciphertext))),
  }
}

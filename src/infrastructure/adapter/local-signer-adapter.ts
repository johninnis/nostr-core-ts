import { schnorr } from "@noble/curves/secp256k1"
import { SignerError, type SignerErrorTag } from "../../domain/exception/signer-error.ts"
import { errorMessage } from "../../domain/service/error-utils.ts"
import { computeEventId } from "../../domain/service/event-id.ts"
import type { Signer } from "../../domain/service/signer.ts"
import type { EventId } from "../../domain/value-object/event-id.ts"
import { formatHex, parseHex } from "../../domain/value-object/hex.ts"
import type { NostrEvent, UnsignedEvent } from "../../domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { parsePublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { Sig } from "../../domain/value-object/sig.ts"
import { parseSig } from "../../domain/value-object/sig.ts"
import { nip04Decrypt, nip04Encrypt } from "./nip04-adapter.ts"
import { getNip44ConversationKey, nip44Decrypt, nip44Encrypt } from "./nip44-adapter.ts"

/**
 * Pure-crypto primitives the local signer adapter delegates to. The default implementation
 * ({@link defaultLocalSignerTools}) wires in `@noble/curves` for Schnorr and the bundled
 * NIP-04 / NIP-44 codecs; consumers can substitute for testing, hardware-backed keys, etc.
 *
 * **NIP-44 is split into key-derivation + codec.** `getNip44ConversationKey` derives the
 * symmetric conversation key (ECDH + HKDF-extract — the expensive step, ~100µs); `nip44Encrypt`
 * / `nip44Decrypt` then operate on that pre-derived key. {@link createLocalSigner} caches the
 * derived key per peer so the expensive step runs once per (sk, peerPubkey) pair regardless of
 * whether the bag is the default or a hardware-backed substitute. NIP-04 stays on the
 * `(secretKey, peerPubkey, payload)` shape because it's a deprecated legacy path with no caching
 * payoff worth the API surface.
 */
export interface LocalSignerTools {
  readonly getPublicKey: (secretKey: Uint8Array) => PublicKey
  readonly schnorrSign: (id: EventId, secretKey: Uint8Array) => Sig
  readonly nip04Encrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: string) => Promise<string>
  readonly nip04Decrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, ciphertext: string) => Promise<string>
  readonly getNip44ConversationKey: (secretKey: Uint8Array, peerPubkey: PublicKey) => Uint8Array
  readonly nip44Encrypt: (conversationKey: Uint8Array, plaintext: string) => string
  readonly nip44Decrypt: (conversationKey: Uint8Array, ciphertext: string) => string
}

/** Generate a fresh 32-byte secp256k1 secret key suitable for use with `createLocalSigner`. */
export const generateSecretKey = (): Uint8Array => schnorr.utils.randomSecretKey()

const getPublicKey = (secretKey: Uint8Array): PublicKey => parsePublicKey(formatHex(schnorr.getPublicKey(secretKey)))

const schnorrSign = (id: EventId, secretKey: Uint8Array): Sig =>
  parseSig(formatHex(schnorr.sign(parseHex(id), secretKey)))

/** Bundled `LocalSignerTools` using `@noble/curves` for Schnorr and the in-tree NIP-04 / NIP-44 adapters. */
export const defaultLocalSignerTools: LocalSignerTools = {
  getPublicKey,
  schnorrSign,
  nip04Encrypt,
  nip04Decrypt,
  getNip44ConversationKey,
  nip44Encrypt,
  nip44Decrypt,
}

const tryOk = async <T>(
  tag: SignerErrorTag,
  fn: () => T | Promise<T>,
): Promise<Result<T, SignerError>> => {
  try {
    return ok(await fn())
  } catch (err) {
    return failure(new SignerError(tag, errorMessage(err), err))
  }
}

/**
 * Construct a `Signer` backed by an in-memory secret key plus the pure-crypto primitives in `tools`.
 * The corresponding public key is derived from `secretKey` via `tools.getPublicKey`. Each call
 * builds an independent `Signer`; the closure also owns a per-peer cache of NIP-44 conversation
 * keys, so repeated encrypt/decrypt against the same peer avoids re-running ECDH + HKDF-extract.
 * The cache is dropped when the signer is garbage-collected, and grows unbounded with the number
 * of distinct peers — fine for application-lifetime signers, not designed for proxy/relay use.
 */
export const createLocalSigner = (secretKey: Uint8Array, tools: LocalSignerTools = defaultLocalSignerTools): Signer => {
  const pubkey = tools.getPublicKey(secretKey)
  const conversationKeyCache = new Map<PublicKey, Uint8Array>()

  const cachedConversationKey = (peerPubkey: PublicKey): Uint8Array => {
    const cached = conversationKeyCache.get(peerPubkey)
    if (cached) return cached
    const key = tools.getNip44ConversationKey(secretKey, peerPubkey)
    conversationKeyCache.set(peerPubkey, key)
    return key
  }

  const getPublicKeyFn = (): Promise<PublicKey> => Promise.resolve(pubkey)

  const signEvent = async (event: UnsignedEvent): Promise<NostrEvent> => {
    const id = await computeEventId({ ...event, pubkey })
    const sig = tools.schnorrSign(id, secretKey)
    return { ...event, id, pubkey, sig }
  }

  const nip04EncryptFn = (peerPubkey: PublicKey, plaintext: string): Promise<Result<string, SignerError>> =>
    tryOk("encrypt-failed", () => tools.nip04Encrypt(secretKey, peerPubkey, plaintext))

  const nip04DecryptFn = (peerPubkey: PublicKey, ciphertext: string): Promise<Result<string, SignerError>> =>
    tryOk("decrypt-failed", () => tools.nip04Decrypt(secretKey, peerPubkey, ciphertext))

  const nip44EncryptFn = (peerPubkey: PublicKey, plaintext: string): Promise<Result<string, SignerError>> =>
    tryOk("encrypt-failed", () => tools.nip44Encrypt(cachedConversationKey(peerPubkey), plaintext))

  const nip44DecryptFn = (peerPubkey: PublicKey, ciphertext: string): Promise<Result<string, SignerError>> =>
    tryOk("decrypt-failed", () => tools.nip44Decrypt(cachedConversationKey(peerPubkey), ciphertext))

  return {
    kind: "local",
    getPublicKey: getPublicKeyFn,
    signEvent,
    nip04Encrypt: nip04EncryptFn,
    nip04Decrypt: nip04DecryptFn,
    nip44Encrypt: nip44EncryptFn,
    nip44Decrypt: nip44DecryptFn,
  }
}

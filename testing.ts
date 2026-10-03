/**
 * Test helpers for the `@innis/nostr-core` package: brand fixtures, a pure event-fixture builder, and a
 * configurable stub `Signer`. Import from `@innis/nostr-core/testing`.
 *
 * @module
 */
import type {
  AuthChallenge,
  EventId,
  HttpUrl,
  LightningAddress,
  Lnurl,
  Nip05Id,
  NostrEvent,
  PeerCipherFn,
  PublicKey,
  RelayUrl,
  Result,
  Sig,
  Signer,
  SignerFailure,
  SubscriptionId,
  Tag,
  UnsignedEvent,
} from "./mod.ts"
import {
  buildRumour,
  defaultLocalSignerTools,
  failure,
  InvalidArgumentError,
  ok,
  parseAuthChallenge,
  parseEventId,
  parseHttpUrl,
  parseLightningAddress,
  parseLnurl,
  parseNip05Id,
  parsePublicKey,
  parseRelayUrl,
  parseSig,
  parseSubscriptionId,
} from "./mod.ts"

const fixtureOf = <T>(parse: (raw: unknown) => T | null, brand: string): (raw: string) => T => (raw: string): T => {
  const parsed = parse(raw)
  if (parsed === null) throw new InvalidArgumentError(`Invalid ${brand} fixture: ${raw}`)
  return parsed
}

/** Brand a known-good test value as a `PublicKey`; throws when `raw` is not one, so a typo fails loudly. */
export const publicKeyFixture: (raw: string) => PublicKey = fixtureOf(parsePublicKey, "PublicKey")
/** Brand a known-good test value as an `EventId`; throws when `raw` is not one. */
export const eventIdFixture: (raw: string) => EventId = fixtureOf(parseEventId, "EventId")
/** Brand a known-good test value as a `Sig`; throws when `raw` is not one. */
export const sigFixture: (raw: string) => Sig = fixtureOf(parseSig, "Sig")
/** Brand a known-good test value as a `Nip05Id`; throws when `raw` is not one. */
export const nip05IdFixture: (raw: string) => Nip05Id = fixtureOf(parseNip05Id, "Nip05Id")
/** Brand a known-good test value as a `RelayUrl`; throws when `raw` is not one. */
export const relayUrlFixture: (raw: string) => RelayUrl = fixtureOf(parseRelayUrl, "RelayUrl")
/** Brand a known-good test value as an `HttpUrl`, in its canonical form; throws when `raw` is not an http(s) URL. */
export const httpUrlFixture: (raw: string) => HttpUrl = fixtureOf(parseHttpUrl, "HttpUrl")
/** Brand a known-good test value as an `AuthChallenge`; throws when `raw` is empty. */
export const authChallengeFixture: (raw: string) => AuthChallenge = fixtureOf(parseAuthChallenge, "AuthChallenge")
/** Brand a known-good test value as a `SubscriptionId`; throws when `raw` is empty or over 64 code points. */
export const subscriptionIdFixture: (raw: string) => SubscriptionId = fixtureOf(parseSubscriptionId, "SubscriptionId")
/** Brand a known-good test value as a LUD-16 `LightningAddress`; throws when `raw` is not one. */
export const lightningAddressFixture: (raw: string) => LightningAddress = fixtureOf(
  parseLightningAddress,
  "LightningAddress",
)
/** Brand a known-good test value as a LUD-01 `Lnurl`; throws when `raw` is not one. */
export const lnurlFixture: (raw: string) => Lnurl = fixtureOf(parseLnurl, "Lnurl")

/** Shape accepted by `buildEventFixture` — every field of `NostrEvent` is optional. */
export interface EventOverrides {
  readonly id?: string
  readonly pubkey?: string
  readonly created_at?: number
  readonly kind?: number
  readonly tags?: ReadonlyArray<Tag>
  readonly content?: string
  readonly sig?: string
}

/**
 * Build a `NostrEvent` *fixture* — a placeholder shaped like a signed event, for tests that exercise reads, filters,
 * parsing and the like. Any field can be overridden; the rest default to a kind-1 note `"test note"` by
 * `"b".repeat(64)` at `1700000000`.
 *
 * A pure function: the same overrides always build the same event. Its `id`, unless overridden, is the NIP-01 id of its
 * fields, so two fixtures that differ in any field have different ids and two that do not are the same event — give
 * each event a test needs apart its own content or `created_at`. Its `sig` is `"c".repeat(128)` and does not verify;
 * sign with a real signer (e.g. `createLocalSigner`) for an event `verifyEventSignature` accepts.
 */
export const buildEventFixture = (overrides: EventOverrides = {}): NostrEvent => {
  const fields = {
    pubkey: publicKeyFixture(overrides.pubkey ?? "b".repeat(64)),
    created_at: overrides.created_at ?? 1700000000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "test note",
  }
  return {
    ...fields,
    id: overrides.id === undefined ? buildRumour(fields).id : eventIdFixture(overrides.id),
    sig: sigFixture(overrides.sig ?? "c".repeat(128)),
  }
}

/** Shape accepted by `buildSignedEventFixture` — the fields of `EventOverrides` the signing key does not decide. */
export type SignedEventOverrides = Omit<EventOverrides, "id" | "pubkey" | "sig">

/**
 * Build a `NostrEvent` fixture signed by `secretKey`, for tests whose code verifies what it reads: the fields
 * `buildEventFixture` builds from `overrides`, its `pubkey` the key's, and a `sig` `verifyEventSignature` accepts. The
 * `id` is the same for the same overrides; the `sig` is not, since BIP-340 signing draws fresh auxiliary randomness.
 */
export const buildSignedEventFixture = (secretKey: Uint8Array, overrides: SignedEventOverrides = {}): NostrEvent => {
  const unsigned = buildEventFixture({ ...overrides, pubkey: defaultLocalSignerTools.getPublicKey(secretKey) })
  return { ...unsigned, sig: defaultLocalSignerTools.schnorrSign(unsigned.id, secretKey) }
}

type AsyncOrSync<T> = T | Promise<T>

/** Callback shape for `createStubSigner({ signEvent })`: a `Signer.signEvent` that may also answer synchronously. */
export type StubSignerSignFn = (event: UnsignedEvent) => AsyncOrSync<Result<NostrEvent, SignerFailure>>
/**
 * Callback shape for the four `createStubSigner` cipher overrides: a `PeerCipherFn` that may also answer synchronously.
 */
export type StubSignerCipherFn = (
  ...args: Parameters<PeerCipherFn>
) => AsyncOrSync<Awaited<ReturnType<PeerCipherFn>>>

/**
 * The `Signer` `createStubSigner` builds, member by member: the `pubkey` its `getPublicKey` answers, its `kind`, and
 * any of its methods to override. One input object because every field is a member of that one signer. Exported so
 * downstream packages can type their own builders.
 */
export interface CreateStubSignerOptions {
  readonly pubkey: PublicKey
  readonly kind?: Signer["kind"]
  readonly signEvent?: StubSignerSignFn
  readonly nip04Encrypt?: StubSignerCipherFn
  readonly nip04Decrypt?: StubSignerCipherFn
  readonly nip44Encrypt?: StubSignerCipherFn
  readonly nip44Decrypt?: StubSignerCipherFn
}

const noSigner = (operation: string): Result<string, SignerFailure> =>
  failure({ type: "no-signer", message: `stub-signer not configured for ${operation}` })

/**
 * Construct a `Signer` for tests. `getPublicKey` resolves to `ok(pubkey)`; `signEvent` defaults to `ok` of a
 * `buildEventFixture` fixture; unspecified crypto operations resolve to a `no-signer` failure. An override that throws
 * rejects the promise its method returns, as an async `Signer` method would.
 */
export const createStubSigner = (options: CreateStubSignerOptions): Signer => ({
  kind: options.kind ?? "local",
  getPublicKey: () => Promise.resolve(ok(options.pubkey)),
  signEvent: (event) =>
    Promise.try(() =>
      options.signEvent ? options.signEvent(event) : ok(buildEventFixture({ ...event, pubkey: options.pubkey }))
    ),
  nip04Encrypt: (pubkey, plaintext) =>
    Promise.try(() => options.nip04Encrypt?.(pubkey, plaintext) ?? noSigner("nip04Encrypt")),
  nip04Decrypt: (pubkey, ciphertext) =>
    Promise.try(() => options.nip04Decrypt?.(pubkey, ciphertext) ?? noSigner("nip04Decrypt")),
  nip44Encrypt: (pubkey, plaintext) =>
    Promise.try(() => options.nip44Encrypt?.(pubkey, plaintext) ?? noSigner("nip44Encrypt")),
  nip44Decrypt: (pubkey, ciphertext) =>
    Promise.try(() => options.nip44Decrypt?.(pubkey, ciphertext) ?? noSigner("nip44Decrypt")),
})

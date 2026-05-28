/**
 * Test helpers for the `@innis/nostr-core` package: a deterministic event-fixture builder,
 * an isolated fixture factory, and a configurable mock `Signer`. Import from
 * `@innis/nostr-core/testing`.
 *
 * @module
 */
import type { NostrEvent, PublicKey, Result, Signer, Tag, UnsignedEvent } from "./mod.ts"
import { failure, parseEventId, parsePublicKey, parseSig, SignerError } from "./mod.ts"

/** Shape accepted by `buildEventFixture` / `EventFactory.build` — every field of `NostrEvent` is optional. */
export interface EventOverrides {
  readonly id?: string
  readonly pubkey?: string
  readonly created_at?: number
  readonly kind?: number
  readonly tags?: ReadonlyArray<Tag>
  readonly content?: string
  readonly sig?: string
}

const assembleFixture = (counter: number, overrides: EventOverrides): NostrEvent => {
  const hex = counter.toString(16).padStart(64, "0")
  return {
    id: parseEventId(overrides.id ?? hex),
    pubkey: parsePublicKey(overrides.pubkey ?? "b".repeat(64)),
    created_at: overrides.created_at ?? 1700000000 + counter,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? `test note ${counter}`,
    sig: parseSig(overrides.sig ?? "c".repeat(128)),
  }
}

let sharedCounter = 0

/**
 * Build a `NostrEvent` *fixture* — a placeholder shaped like a signed event, suitable for tests
 * that exercise reads, filters, parsing, etc. Any field can be overridden.
 *
 * Named `buildEventFixture` (not `build*` for a real event) so the call site signals: this is a
 * pretend event, not a thing you should publish. The defaults are NOT cryptographically valid —
 * `id` is a counter-based hex string and `sig` is a constant `"c".repeat(128)`, neither computed
 * from the rest of the event. Round-trip helpers like `verifyEventSignature` or `computeEventId`
 * will not pass on the default output; use a real signer (e.g. `createLocalSigner` from the main
 * entry point) when you need a signed-and-verifiable event.
 *
 * The internal counter is **module-global**: tests across files share it, and parallel test runners
 * may race. Call `resetEventFixtureCounter` at the start of any test file that depends on stable
 * IDs, or — for guaranteed isolation — use `createEventFactory()`.
 */
export const buildEventFixture = (overrides: EventOverrides = {}): NostrEvent => {
  sharedCounter++
  return assembleFixture(sharedCounter, overrides)
}

/** Reset the shared `buildEventFixture` counter so subsequent calls start producing IDs from `0...01` again. */
export const resetEventFixtureCounter = (): void => {
  sharedCounter = 0
}

/** Isolated event-fixture factory; each instance closes over its own counter. */
export interface EventFactory {
  readonly build: (overrides?: EventOverrides) => NostrEvent
  readonly reset: () => void
}

/**
 * Create an `EventFactory` with its own private counter. Use this in parallel-safe test suites and
 * anywhere a deterministic, race-free sequence of fixture IDs is required. The shared counter used
 * by `buildEventFixture` is left untouched.
 */
export const createEventFactory = (options: { readonly startAt?: number } = {}): EventFactory => {
  let local = options.startAt ?? 0
  return {
    build: (overrides = {}) => {
      local++
      return assembleFixture(local, overrides)
    },
    reset: () => {
      local = options.startAt ?? 0
    },
  }
}

type AsyncOrSync<T> = T | Promise<T>

/** Callback shape for `createMockSigner({ signEvent })`. Throws to match the `Signer.signEvent` contract. */
export type MockSignerSignFn = (event: UnsignedEvent) => AsyncOrSync<NostrEvent>
/** Callback shape for `createMockSigner({ nip04Encrypt | nip44Encrypt })`. `pubkey` is branded — the mock receives the same `PublicKey` the caller passed to `signer.nipNNEncrypt`. */
export type MockSignerEncryptFn = (pubkey: PublicKey, plaintext: string) => AsyncOrSync<Result<string, SignerError>>
/** Callback shape for `createMockSigner({ nip04Decrypt | nip44Decrypt })`. `pubkey` is branded — the mock receives the same `PublicKey` the caller passed to `signer.nipNNDecrypt`. */
export type MockSignerDecryptFn = (pubkey: PublicKey, ciphertext: string) => AsyncOrSync<Result<string, SignerError>>

/** Options accepted by `createMockSigner`. Exported so downstream packages can type their own builders. */
export interface CreateMockSignerOptions {
  readonly pubkey: PublicKey
  readonly kind?: Signer["kind"]
  readonly signEvent?: MockSignerSignFn
  readonly nip04Encrypt?: MockSignerEncryptFn
  readonly nip04Decrypt?: MockSignerDecryptFn
  readonly nip44Encrypt?: MockSignerEncryptFn
  readonly nip44Decrypt?: MockSignerDecryptFn
}

const noSigner = (operation: string): Result<string, SignerError> =>
  failure(new SignerError("no-signer", `mock-signer not configured for ${operation}`))

/** Construct a `Signer` for tests; unspecified crypto operations resolve to a `no-signer` failure. */
export const createMockSigner = (options: CreateMockSignerOptions): Signer => ({
  kind: options.kind ?? "local",
  getPublicKey: () => Promise.resolve(options.pubkey),
  signEvent: (event) =>
    Promise.resolve(
      options.signEvent ? options.signEvent(event) : buildEventFixture({ ...event, pubkey: options.pubkey }),
    ),
  nip04Encrypt: (pubkey, plaintext) =>
    Promise.resolve(options.nip04Encrypt?.(pubkey, plaintext) ?? noSigner("nip04Encrypt")),
  nip04Decrypt: (pubkey, ciphertext) =>
    Promise.resolve(options.nip04Decrypt?.(pubkey, ciphertext) ?? noSigner("nip04Decrypt")),
  nip44Encrypt: (pubkey, plaintext) =>
    Promise.resolve(options.nip44Encrypt?.(pubkey, plaintext) ?? noSigner("nip44Encrypt")),
  nip44Decrypt: (pubkey, ciphertext) =>
    Promise.resolve(options.nip44Decrypt?.(pubkey, ciphertext) ?? noSigner("nip44Decrypt")),
})

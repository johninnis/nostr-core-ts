/**
 * Foundation primitives for the Innis Nostr stack.
 *
 * `@innis/nostr-core` is the contracts and protocol-primitives layer that every Innis library builds on. It ships
 * **only protocol-spec behaviour** — branded primitives, event builders, signature verification, NIP-19 bech32, NIP-17
 * gift-wrap construction, NIP-98 HTTP auth — plus the `Signer` and `HttpClient` port types that downstream packages
 * implement. Application-policy concerns (relay-pool strategy, DM persistence, refresh schedules) live in consumers,
 * not here.
 *
 * @example
 * ```ts
 * import {
 *   buildTextNote,
 *   createLocalSigner,
 *   encodePubkeyToNpub,
 *   generateSecretKey,
 *   verifyEventSignature,
 * } from "@innis/nostr-core"
 *
 * const signer = createLocalSigner(generateSecretKey())
 * const pubkey = await signer.getPublicKey()
 * if (pubkey.success) console.log("npub:", encodePubkeyToNpub(pubkey.value))
 *
 * const signed = await signer.signEvent(buildTextNote("hello nostr"))
 * if (signed.success) console.log("signature ok:", verifyEventSignature(signed.value))
 * ```
 *
 * ## Public surface
 *
 * Every public symbol is curated through its layer barrel; this file aggregates them with `export *` and does no
 * curation of its own. Adding a new public symbol is a one-line edit to the appropriate layer barrel:
 *
 *   - `src/domain/value-object/mod.ts` — branded primitives, `Result`, kinds, value shapes
 *   - `src/domain/failure/mod.ts` — returned `*Failure` values (`SignerFailure`, `JsonParseFailure`,
 *     `Nip98ValidationFailure`, `RumourParseFailure` …)
 *   - `src/domain/exception/mod.ts` — thrown `*Error` faults under the abstract root `NostrError`
 *     (`InvalidArgumentError`, `InvariantError`, the NIP-04/-44 codec errors)
 *   - `src/domain/service/mod.ts` — pure domain services (bech32, builders, filters, JSON, hex, rumours, NIP-98 …)
 *   - `src/application/failure/mod.ts` — `HttpRequestFailure`, `MalformedBodyFailure`, `JsonFetchFailure`,
 *     `JsonDecryptFailure`, `PrivateEntriesFailure`, `GiftWrapUnwrapFailure`
 *   - `src/application/port/mod.ts` — the `HttpClient` and `Nip98ReplayGuard` ports
 *   - `src/application/service/mod.ts` — JSON documents over HTTP, NIP-05, NIP-11, NIP-98 validation, NIP-17 gift
 *     wraps, NIP-51 lists
 *   - `src/infrastructure/crypto/mod.ts` — the local signer and the NIP-04/-44 codecs
 *   - `src/infrastructure/http/mod.ts` — the `fetch`-backed `HttpClient`
 *
 * The design decisions behind this layout and the public API are recorded in `docs/adr/`.
 *
 * @module
 */

export * from "./src/domain/value-object/mod.ts"
export * from "./src/domain/failure/mod.ts"
export * from "./src/domain/exception/mod.ts"
export * from "./src/domain/service/mod.ts"
export * from "./src/application/failure/mod.ts"
export * from "./src/application/port/mod.ts"
export * from "./src/application/service/mod.ts"
export * from "./src/infrastructure/crypto/mod.ts"
export * from "./src/infrastructure/http/mod.ts"

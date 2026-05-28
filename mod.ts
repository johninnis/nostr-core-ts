/**
 * Foundation primitives for the Innis Nostr stack.
 *
 * `@innis/nostr-core` is the contracts and protocol-primitives layer that every Innis library
 * builds on. It ships **only protocol-spec behaviour** — branded primitives, event builders,
 * signature verification, NIP-19 bech32, NIP-17 gift-wrap construction, NIP-98 HTTP auth — plus
 * the `Signer` and `HttpClient` port types that downstream packages implement. Application-policy
 * concerns (relay-pool strategy, DM persistence, refresh schedules) live in consumers, not here.
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
 * console.log("npub:", encodePubkeyToNpub(pubkey))
 *
 * const event = await signer.signEvent(buildTextNote("hello nostr"))
 * console.log("signature ok:", await verifyEventSignature(event))
 * ```
 *
 * ## Public surface
 *
 * Every public symbol is curated through its layer barrel; this file aggregates them with
 * `export *` and does no curation of its own. Adding a new public symbol is a one-line edit to
 * the appropriate layer barrel:
 *
 *   - `src/domain/value-object/mod.ts`    — branded primitives, `Result`, kinds, value shapes
 *   - `src/domain/exception/mod.ts`       — `TaggedError` hierarchy (Signer / JsonCrypto / NIP-04/-44/-98 / Encryption …)
 *   - `src/domain/service/mod.ts`         — pure domain services (bech32, builders, filter/sort, NIP-98 …)
 *   - `src/application/exception/mod.ts`  — `GiftWrapUnwrapError`, `Nip11FetchError`
 *   - `src/application/port/mod.ts`       — `HttpClient` port type
 *   - `src/application/service/mod.ts`    — NIP-17 gift-wrap pair/unwrap, NIP-05 resolver + verifier
 *   - `src/infrastructure/adapter/mod.ts` — concrete adapters (HTTP fetch, local signer, NIP-04/-44/-11 codecs)
 *
 * See `README.md` §"Design conventions" for the locked-in architectural decisions
 * (Signer throw-vs-Result split, builder signatures, barrel structure, Clock/RNG status).
 *
 * @module
 */

export * from "./src/domain/value-object/mod.ts"
export * from "./src/domain/exception/mod.ts"
export * from "./src/domain/service/mod.ts"
export * from "./src/application/exception/mod.ts"
export * from "./src/application/port/mod.ts"
export * from "./src/application/service/mod.ts"
export * from "./src/infrastructure/adapter/mod.ts"

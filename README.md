# @innis/nostr-core

The foundation. Branded primitives, event utilities, the `Signer` and `HttpClient` interfaces, NIP-19 / NIP-05 encoding, kind constants, a few small async helpers, the `Result` type, and a single `TaggedError` hierarchy every error in the ecosystem extends. Every other `@innis/*` package depends on it.

NIP-44 v2 is vendored from [paulmillr/nip44](https://github.com/paulmillr/nip44/) (see [Credits](#credits)); Schnorr / secp256k1 come from `@noble/curves`. `defaultLocalSignerTools` exports a ready-made bag of all of these — drop it straight into `createLocalSigner`, or pass your own `LocalSignerTools` to swap any of them out (hardware signer, alternate NIP-44, etc.).

Test helpers ship from the secondary entry point `@innis/nostr-core/testing` — see [Test helpers](#test-helpers).

## Install

```sh
deno add jsr:@innis/nostr-core
```

**Requires Deno ≥ 2.1** (uses TypeScript 5.7+ generic typed-array syntax `Uint8Array<ArrayBuffer>` in NIP-04's WebCrypto adapter).

## Getting started

`defaultLocalSignerTools` is a ready-made `LocalSignerTools` bag covering Schnorr signing, NIP-44 v2, and NIP-04. Combine with `createLocalSigner` to sign and encrypt:

```ts
import {
  buildTextNote,
  createLocalSigner,
  generateSecretKey,
} from "jsr:@innis/nostr-core"

const secretKey = generateSecretKey()
const signer = createLocalSigner(secretKey)            // defaults to defaultLocalSignerTools

const signed = await signer.signEvent(buildTextNote("hello nostr"))
```

`createLocalSigner` derives the public key from `secretKey` via the tools' `getPublicKey` — callers never have to pre-compute or thread one. `nostr-core` owns the event-id computation (`computeEventId` — canonical NIP-01 serialise + SHA-256) so the bag only needs to provide the raw Schnorr signature over a hex id. To swap any primitive (e.g. a hardware-backed Schnorr, a different NIP-44 implementation, a remote-key NIP-04), pass a custom `LocalSignerTools` object as the second arg.

In-browser code typically uses `@innis/nostr-nip07` (extension signer) or `@innis/nostr-nip46` (remote bunker signer) instead of `createLocalSigner`.

## Why this exists, not `nostr-tools`

`@innis/nostr-core` is a **contracts library**, not an implementation library. [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) is the canonical batteries-included Nostr toolkit and is excellent at what it does; the two are not feature-for-feature competitors. They are different shapes.

The `@innis/*` ecosystem needs shared contracts that `nostr-tools` does not expose:

- **Branded primitives at every boundary.** `PublicKey`, `EventId`, `RelayUrl`, `Sig` are branded `string`s with `parseX(raw)` validators that throw on invalid input. In a hex-soup domain like Nostr — where pubkeys, event ids, and `d`-tags all look identical to the eye — this catches bugs at compile time that stringly-typed code only catches in production. `nostr-tools` passes raw `string` everywhere.
- **`Signer` is a port, not a kind of object.** One interface that NIP-07 (`@innis/nostr-nip07`), NIP-46 (`@innis/nostr-nip46`), and `createLocalSigner` all satisfy. Consumers thread "a `Signer`" everywhere and pick one at login. `nostr-tools` exposes each signing path as a separate API the consumer has to bridge.
- **Crypto failures as `Result<string, SignerError>`.** `nip44*` and `nip04*` return a discriminated `SignerError` tagged `no-signer | disconnected | decrypt-failed | encrypt-failed`. A user-facing toast can distinguish "bunker disconnected" from "junk ciphertext" without inspecting error messages. User rejection is its own class — `SignerRejectedError` — not a `SignerError` tag. `nostr-tools` throws.
- **`HttpClient` is a port.** Libs that touch HTTP (`@innis/blossom`, `@innis/relay-management` for NIP-86 admin RPC, plus in-core NIP-05 verification and NIP-11 fetch) never call `fetch` directly. They consume one interface returning `Result<HttpResponse, NetworkError>` — a 500 is a `Failure(ServerError)`, a transport failure is `Failure(NetworkError)`. Same code runs in tests against an in-memory `HttpClient`, no network mocks required.
- **One `TaggedError` hierarchy.** Every error this package throws or returns extends `TaggedError<Tag>` with a literal `tag` field for exhaustive discrimination. Catching `TaggedError` matches the whole family; downstream `@innis/*` packages compose their own subclasses on the same shape.
- **No transport in core.** `@innis/nostr-core` has zero relay code. The pool / selection / store equivalents live in `@innis/nostr-relay-pool`, `@innis/nostr-relay-selection`, and `@innis/nostr-event-store`. The core can't initiate I/O at all — every consumer composes its own routing strategy rather than inheriting a fixed one.
- **`encryptJson` / `decryptJson` enforce one JSON-over-NIP-44 path.** The boilerplate `signer.nip44Encrypt(pk, JSON.stringify(...))` becomes the only sanctioned API; tests against the contract, not the wiring.

The crypto code itself is not the differentiator. Both libraries lean on `@noble/curves` and `@noble/hashes` underneath, and `@innis/nostr-core` vendors paulmillr/nip44's reference implementation — the same code that `nostr-tools` ships, audited by Cure53 in late 2023. The justification for `@innis/nostr-core` is the **shape of the interface**, not the cryptography.

If you are building an app and do not need ports or branded primitives, use `nostr-tools` directly. If you are building inside the `@innis/*` ecosystem or want testable, swappable boundaries, this is the contract layer.

## Stability

`0.x` — the API is in active use by the sibling `@innis/*` packages and treated as effectively stable, but breaking changes remain possible before `1.0`. Pin a minor version if that matters to you.

## Public surface

### Branded types — `src/domain/value-object/`

- `PublicKey`, `EventId`, `Sig`, `RelayUrl`, `Nip05Id` — branded `string` types for the core identifiers.
- `NostrEvent`, `UnsignedEvent`, `Tag` — event shapes.
- `NostrFilter` — relay query filter.
- `Result<T, E>` — discriminated union with `ok(value)`, `failure(error)`, `isOk(r)`, `isFailure(r)`.

Each branded primitive has two entry points:

- `parseX(raw)` — validates and brands; throws `InvalidXError` on failure. **This is the only way to brand a value** — use it at every system boundary.
- `isValidX(raw)` — type-guard predicate (narrows `string` to the brand) for when failure is data, not an exception.

`hexRegex(length)` builds the underlying validator (`isValidPublicKey` is `hexRegex(64).test(raw)`, `isValidSig` is `hexRegex(128).test(raw)`). Use it whenever you need to validate hex of a custom length. `createHexBrand({ errorName, errorPrefix, hexLength })` and the more general `createBrand({...})` are the same factories the library itself uses — downstream `@innis/*` packages can define their own brands without copying the boilerplate.

`normaliseRelayUrl(url)` returns `RelayUrl | null` — validates `wss?://` and strips trailing slashes / lowercases the host. This is the canonical relay-URL normaliser shared by `@innis/nostr-relay-pool` and `@innis/nostr-relay-selection`. `toRelayUrls(urls)` runs the same normaliser over an array and dedupes by canonical form. `wsToHttp(url)` converts a `ws(s)://` relay URL into its `http(s)://` counterpart (used for NIP-11 document fetches).

`Nip05Id` is the lowercased, spec-validated NIP-05 form (`name@domain.tld`, per the NIP-05 regex). `parseNip05Id(raw)` trims, lowercases, validates; throws `InvalidNip05IdError` on garbage. Use it whenever a NIP-05 string crosses into a typed slot (`Nip05Verifier.verify`, profile records, `resolveNip05`).

`AddressableEventRef` is `{ kind, pubkey: PublicKey, dTag }` — the value-object for NIP-01 parameterised-replaceable coordinates. `formatAddressableRef(ref)` produces the `kind:pubkey:d` wire form (`a`-tag value, `naddr` payload); `parseAddressableRef(value)` is the strict inverse, returning `null` for malformed input (it requires a clean integer kind, a valid pubkey, and tolerates a `:`-containing `dTag`).

### Event helpers — `src/domain/service/` (plus `kinds.ts` in `src/domain/value-object/`)

- `value-object/kinds.ts` — `KIND_*` constants (single source of truth for every kind the lib understands). The constant block lives in the value-object layer because kinds are protocol-data, not behaviour.
- `service/kinds.ts` — the canonical NIP-18 `REPOST_KINDS` grouping with its `isRepostKind` predicate, and the replaceable / parameterised-replaceable range predicates (`isReplaceable`, `isParameterisedReplaceable`).
- `service/replaceable.ts` — `replaceableStorageKey(event)` returns `pubkey:kind[:d]`, the canonical cache/storage key — **not** the `a`-tag wire format; for that use `formatAddressableRef`.

App-specific kind groupings (engagement, profile-metadata, list kinds, etc.) live in the consumer — they are policy, not protocol.
- `tags.ts` — generic helpers: `getTagValue(tags, name)` (singular, returns the first match), `extractTagValues(tags, name)` (plural — drops tags with empty `value`), and `hasTag` / `addTag` / `removeTag` (match by `name + value`). Typed wrappers exist only where they add brand safety: `extractPubkeys` / `hasPubkey` / `addPubkeyTag` / `removePubkeyTag` (`PublicKey`), `extractEventIds` / `hasEventId` / `addEventTag` / `removeEventTag` (`EventId`), `extractEventRefs`. Relay-tag helpers (`extractRelayEntries`, `hasRelayEntry`, `addRelayTag`, `removeRelayTag`, `getRelayEntryMarker`) carry marker logic, not just a string match. **`addRelayTag` is intentionally an upsert**: it stays under the `add*` verb for API consistency with the rest of the family and because in the no-existing-entry case it behaves identically — it adds the tag. When an `r` tag for that URL already exists, the new call is treated as the most recent expression of caller intent and overwrites the marker (most-recent-wins). Relay tags are unique by URL, so there is no sensible state where two `r` tags for the same URL coexist with different markers. The other `add*Tag` helpers are no-op-on-duplicate because their tags carry no extra state — `[name, value]` equality is total — so there is nothing for a second call to update. For plain string-valued tags (`t`, `word`, `server`, etc.) use the generic API: `hasTag(tags, "t", hashtag)`. For `a`-tag parsing, use `parseAddressableRef` from the value-object barrel. `decryptPrivateEntries` and `extractFullList` for NIP-51 lists with encrypted content (consume a `DecryptFn = (pubkey, ciphertext) => Promise<Result<string, SignerError>>`); they return `Result<_, PrivateEntriesError>` where the error union spans signer failure and the dedicated `PrivateEntriesParseError`.
- `builder.ts` — `buildTextNote(content, replyContext?)`, `buildRepost`, `buildReaction`, `buildDeletion`, `buildHighlightFromUrl`, `buildHighlightFromEvent`, `buildLongform`, `buildZapRequest`. Each returns an `UnsignedEvent` — pass to a `Signer` to sign.
- `event-id.ts` — `computeEventId({ pubkey, ...unsigned })` performs the canonical NIP-01 serialise + SHA-256 and returns a branded `EventId`. The single sanctioned way to derive an id; `createLocalSigner` uses it so the `LocalSignerTools` bag can stay raw-crypto-only.
- `transformer.ts` — `transformEvent(event)` returns a normalised view including `refs.isReply`. **This is the ONE way to determine reply-ness** (kinds 1 and 1111 only).
- `filter.ts` — `matchesFilter(event, filter)`, `matchesAnyFilter(event, filters)`.
- `filter-hash.ts` — `hashFilters(filters)` returns the lowercase hex SHA-256 of a `REQ` filter set's canonical form: filter sets that select the same events (differing only in object-key, array-element, or filter order) hash equal, so it is a safe fixed-length subscription dedup key. Synchronous. See [Filter-set hash](#filter-set-hash) for the canonicalisation spec and cross-language parity status.
- `event-utils.ts` — `parseNostrInput(value)`, `buildEventFilter(parsed)` (returns `NostrFilter | null` — `null` when the input resolved to a profile, not an event), `parseNostrEvent(value)` (validates and returns a `NostrEvent` or `null`), `validateEventStructure(event)` returning `ReadonlyArray<EventStructureCheck>` (field-by-field structural diagnostics).
- `zap-parser.ts` — `parseZapReceipt(event)`, `parseNutzap(event)`, `parseBolt11Amount(invoice)`, `parseAmountSats(tags)`.
- `verify.ts` — `verifyEventSignature(event)` returns a `Promise<boolean>`; uses `@noble/curves` Schnorr.
- `sort.ts` — `byCreatedAtDesc` and `byCreatedAtAsc` comparators.
- `sha256.ts` — `computeSha256(data)` hashes a `BufferSource` (uses WebCrypto when available, falls back to `@noble/hashes`); `sha256Hex(text)` is the string-input convenience wrapper.
- `reaction.ts` — `DEFAULT_REACTION` (the `"+"` literal used when no emoji is supplied) and `formatReactionEmoji(content)` (normalises an event's reaction content to its display form).
- `error-utils.ts` — `errorMessage(err)` extracts a message string from any thrown value; `reportUnhandledError(err)` is the standard sink for fire-and-forget rejections (re-throws in a microtask so the host's uncaught-exception handler picks it up).

### Encoding — bech32 + NIP-05

- `src/domain/service/bech32.ts` — encoders take branded inputs: `encodePubkeyToNpub(pubkey: PublicKey)`, `encodeEventIdToNote(eventId: EventId)`, `encodeNevent(eventId, { relayUrls?, authorPubkey?, kind? })`, `encodeNaddr(ref, relays?)`, `encodeNprofile(pubkey, relays?)`. `decodeNostrEntity(str)` returns a discriminated union: `DecodedNpub` / `DecodedNote` / `DecodedNevent` / `DecodedNaddr` / `DecodedNprofile` (each carries already-branded `pubkey: PublicKey` and/or `eventId: EventId` fields, so callers don't re-parse). `pubkeyFromNip19(input)` extracts a `PublicKey` from any NIP-19 entity that carries one (npub / nprofile / nevent-with-author / naddr), returning `null` for `note1...` or unparseable input. `stripNostrUriPrefix(input)` drops `nostr:` URI prefixes; `NOSTR_ENTITY_REGEX` is the global-search regex for free-form text.
- `src/application/service/nip05-resolver.ts` — `resolveNip05(identifier: Nip05Id, httpClient, options?)` resolves to `PublicKey | null` via NIP-05. Construct the `Nip05Id` argument via `parseNip05Id` (see Branded types). `options.timeoutMs` defaults to 10 000 ms; pass `signal` to forward an `AbortSignal` from the host. Server `names` lookups are case-insensitive against the local-part (per NIP-05).

For hex ↔ bytes use `parseHex(raw)` / `formatHex(bytes)` — re-exports of `@noble/hashes/utils#hexToBytes`/`bytesToHex` under the project's verbs. `parseHex` throws on odd-length or non-hex input; wrap with try/catch at boundaries that take untrusted input.

### HTTP port — `src/application/port/http.ts`

The libs that do HTTP — `@innis/blossom` (media uploads), `@innis/relay-management` (NIP-86 admin RPC), and `@innis/nostr-core`'s own NIP-05 verifier + NIP-11 relay-info fetch — never touch `fetch` directly. They consume one interface so they stay testable without a network and runnable in any environment.

```ts
type HttpRequestError = NetworkError | ServerError

interface HttpClient {
  readonly request: (input: HttpRequest) => Promise<Result<HttpResponse, HttpRequestError>>
}
```

`HttpRequest` is `{ url, method, headers?, body?, timeoutMs?, signal? }`. `timeoutMs` is a hard ceiling across headers exchange and body read; `signal` is the caller's `AbortSignal` (composes with `timeoutMs` — whichever fires first wins). `HttpResponse` exposes `status`, `headers`, and three body readers — `json()`, `text()`, and `blob()` — all returning `Promise<Result<T, NetworkError>>` (stream + parse failures are wrapped — application code never needs `try/catch`). Body readers are single-shot; calling any of them twice returns `Failure(NetworkError("body stream already read"))`. The outer request shape is `Result<HttpResponse, HttpRequestError>` — success/failure as data, not exceptions:

- **Transport failure** (DNS, refused, aborted, CORS) → `Failure(NetworkError)` carrying the underlying thrown value as `cause`.
- **HTTP status ≥ 400** (4xx / 5xx) → `Failure(ServerError)` with `status` and `message`. The `message` is populated from the `x-reason` response header if present, otherwise from the response-body text (truncated at 8 KiB of bytes — multi-byte UTF-8 can't overshoot — so a 4xx with a multi-MB body can't OOM the caller).
- **HTTP status < 400** (2xx / 3xx) → `Success(HttpResponse)`. The body is unconsumed — readers call `json()` / `text()` / `blob()` lazily.

Consumers therefore only need to check `if (!result.success) return ...` — the second `status >= 400` branch the old shape required is gone.

`createHttpClient(options?)` ships a default `globalThis.fetch` adapter — pass it straight to any lib that takes an `HttpClient` port. `options.fetch` accepts a custom `fetch` implementation (used by tests and custom-transport setups). Tests hand-roll an in-memory `HttpClient` returning canned responses; the in-memory mock must mirror the same status-mapping rule (use the `status >= 400 → Failure(ServerError)` convention to keep test behaviour aligned with production). The full contract — including the `message` source-of-truth rules and body-reader single-shot behaviour — lives as JSDoc on `HttpClient` in `src/application/port/http.ts`.

### Signer interface — `src/domain/service/signer.ts`

```ts
type SignerKind = "local" | "extension" | "bunker"

interface Signer {
  readonly kind: SignerKind
  readonly getPublicKey: () => Promise<PublicKey>
  readonly signEvent: (event: UnsignedEvent) => Promise<NostrEvent>
  readonly nip04Encrypt: (pubkey: PublicKey, plaintext: string) => Promise<Result<string, SignerError>>
  readonly nip04Decrypt: (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>
  readonly nip44Encrypt: (pubkey: PublicKey, plaintext: string) => Promise<Result<string, SignerError>>
  readonly nip44Decrypt: (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>
}
```

NIP-04 is deprecated (unauthenticated AES-CBC) and present only for legacy interop — new code should use NIP-44. Implementations that don't want to support NIP-04 must still satisfy the interface; return `failure(new SignerError("encrypt-failed" | "decrypt-failed", "nip04 not supported"))` from the two methods.

Both `nipNN*` pairs return `Result<string, SignerError>` so callers can distinguish "no signer" from "bunker disconnected" from "ciphertext was junk":

```ts
type SignerErrorTag = "no-signer" | "disconnected" | "decrypt-failed" | "encrypt-failed"
```

User rejection is **not** a `SignerError` tag — it is `SignerRejectedError`, its own class. Adapters throw `SignerRejectedError` from `signEvent` and use `isUserRejection(err)` at the boundary when wrapping a third-party signer that signals rejection via a plain `Error`.

`signEvent` throws on failure — concrete signer adapters (`@innis/nostr-nip07`, `@innis/nostr-nip46`) raise `SigningError`, `SignerRejectedError`, or `PubkeyMismatchError`. This package's own `createLocalSigner` never throws from `signEvent` (it owns the key). See the Errors section below for the full contract.

`@innis/nostr-nip07` and `@innis/nostr-nip46` both implement the `Signer` interface — the consumer picks one at login and threads the same `Signer` everywhere.

#### `encryptJson` / `decryptJson` — `src/domain/service/json-crypto.ts`

`encryptJson(signer, pubkey, value)` JSON-stringifies and calls `nip44Encrypt`, returning `Result<string, JsonCryptoError>`. `decryptJson(signer, pubkey, ciphertext)` calls `nip44Decrypt` and `JSON.parse`s the payload, returning `Result<unknown, JsonCryptoError>` — callers validate the shape. **The ONE way to round-trip JSON over NIP-44.** Never call `signer.nip44*` with manual `JSON.stringify` / `JSON.parse`.

#### `createLocalSigner` — `src/infrastructure/adapter/local-signer-adapter.ts`

```ts
interface LocalSignerTools {
  readonly getPublicKey:             (secretKey: Uint8Array) => PublicKey
  readonly schnorrSign:              (id: EventId, secretKey: Uint8Array) => Sig
  readonly nip04Encrypt:             (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: string)  => Promise<string>
  readonly nip04Decrypt:             (secretKey: Uint8Array, peerPubkey: PublicKey, ciphertext: string) => Promise<string>
  readonly getNip44ConversationKey:  (secretKey: Uint8Array, peerPubkey: PublicKey) => Uint8Array
  readonly nip44Encrypt:             (conversationKey: Uint8Array, plaintext: string)  => string
  readonly nip44Decrypt:             (conversationKey: Uint8Array, ciphertext: string) => string
}

createLocalSigner(secretKey: Uint8Array, tools?: LocalSignerTools): Signer
```

The bag is raw crypto primitives only. NIP-44 is split in two: `getNip44ConversationKey` derives the symmetric key (ECDH + HKDF-extract — the expensive ~100µs step), and `nip44Encrypt` / `nip44Decrypt` run the chacha20+hmac codec over that pre-derived key. `createLocalSigner` caches the derived key per peer so the expensive step runs once per `(secretKey, peerPubkey)` pair regardless of whether the bag is the default or a hardware-backed substitute — hardware signers override `getNip44ConversationKey` to talk to a secure element, then the codec runs on the cheap host-side bytes. NIP-04 stays on the `(secretKey, peerPubkey, payload)` shape because it's a deprecated legacy path with no caching payoff worth the API surface. `createLocalSigner` also runs `computeEventId` itself to derive the event id, then asks the bag to produce a Schnorr signature over that id. The public key is derived from `secretKey` via `tools.getPublicKey` — callers never have to pre-compute one. `defaultLocalSignerTools` is the ready-made bag using `@noble/curves` for Schnorr/secp256k1 and a vendored copy of paulmillr's NIP-44 v2 reference for the encryption; it's the default when `tools` is omitted. Pass any `LocalSignerTools`-shaped object to swap any of these primitives out. `createLocalSigner` is used by the NIP-46 *bunker* role (the side that holds a real key) and by tests; in-browser consumers should use `@innis/nostr-nip07` or `@innis/nostr-nip46` instead.

`generateSecretKey()` is the sanctioned secret-key generator — a thin re-export of `@noble/curves`' `schnorr.utils.randomSecretKey()`. Use it for tests, throwaway local keys, and the bunker side of NIP-46. Hold the resulting `Uint8Array` carefully; the project ships no persistence layer for it.

#### NIP-44 / NIP-04 codecs

`nip44Encrypt(conversationKey, plaintext, nonce?)` / `nip44Decrypt(conversationKey, payload)` / `getNip44ConversationKey(secretKey, peerPubkey)` (all from `src/infrastructure/adapter/nip44-adapter.ts`) cover the NIP-44 v2 path. Both crypto directions throw `Nip44CryptoError` on malformed input or wrong-nonce-length. Most callers should use `encryptJson` / `decryptJson` instead; reach for these directly only when you already have a pre-derived conversation key. The constants `NIP44_MIN_PLAINTEXT_SIZE` and `NIP44_MAX_PLAINTEXT_SIZE` re-export the codec's plaintext-size bounds.

`nip04Encrypt(secretKey, peerPubkey, plaintext)` / `nip04Decrypt(secretKey, peerPubkey, payload)` cover the deprecated NIP-04 path; they throw `Nip04DecryptError` on a malformed `<ct>?iv=<iv>` payload, decryption failure, or wrong IV length.

### Event-id computation — `src/domain/service/event-id.ts`

`computeEventId(event)` performs the canonical NIP-01 serialise (`[0, pubkey, created_at, kind, tags, content]`) and SHA-256 in one step, returning a branded `EventId`. The input shape `EventToSign` is `UnsignedEvent & { pubkey: PublicKey }`. This is crypto-free (only `crypto.subtle.digest` is needed, with a software-SHA-256 fallback in noble) and is the single sanctioned way to derive an event id.

### NIP-98 HTTP auth — `src/domain/service/nip98-builder.ts` + `nip98-validator.ts`

- `buildNip98AuthEvent({ url, method, body?, expiresInSeconds?, createdAt? })` — builds the unsigned kind-27235 event. Hashes `body` into a `payload` tag when non-empty; emits an `expiration` tag at `createdAt + expiresInSeconds` when supplied (`DEFAULT_AUTH_EXPIRATION_SECONDS` = 60s is the spec-recommended default).
- `encodeAuthHeader(signedEvent)` — base64-encode a signed event for `Authorization: Nostr <header>`.
- `parseAuthHeader(header)` — parse the `Authorization: Nostr <base64>` header into its signed event (signature **not** verified); returns `Result<NostrEvent, Nip98ValidationError>` for relays that want to inspect the event before validating.
- `createNip98Validator({ replayGuard, timestampTolerance?, clock? })` returns `{ validate, validateAuthHeader }`. Wire your own `Nip98ReplayGuard` (`recordOnce(id, ttl)` returns `false` if already consumed). The validator honours the optional `expiration` tag — events past their expiry are rejected with `tag: "expired"`.

**Payload-tag policy (strict per NIP-98):** the spec says the `payload` tag carries the SHA-256 of the request body **only when the body is non-empty**. We enforce both directions:

- non-empty body → `payload` tag MUST be present and hash-match → otherwise `Nip98ValidationError("payload-missing", ...)` or `Nip98ValidationError("payload-mismatch", ...)`.
- empty body → `payload` tag MUST be absent → presence rejected with `Nip98ValidationError("payload-unexpected", "Event contains payload tag but no request body hash was supplied")`.

If you encounter an over-permissive client that signs empty-body requests with a `payload` tag carrying `sha256("") = e3b0c4…`, that client is off-spec. We reject; we do not match-on-empty.

### NIP-17 DMs — `src/application/service/dm-crypto.ts`

- `buildDmGiftWraps({ signer, ... })` builds the gift-wrap pair (one for recipient, one for sender) — returns `Result<ReadonlyArray<GiftWrapTarget>, EncryptionError>`.
- `unwrapGiftWrap(signer, event)` reverses the kind-1059 → seal → rumor wrapping, returning `Result<UnwrapResult, GiftWrapUnwrapError>`. `GiftWrapUnwrapError` is tagged `not-gift-wrap | seal-decrypt-failed | seal-malformed | seal-wrong-kind | rumor-decrypt-failed | rumor-malformed | rumor-wrong-kind | rumor-pubkey-mismatch` — UI callers can surface diagnostics; bulk-feed callers wanting the hot null path do `result.success ? result.value : null`.
- `parseRumor(value)` validates `value` as a NIP-17 rumor (an unsigned event with a known author pubkey); returns `null` if any field is invalid.

### NIP-05 — `src/application/service/nip05-{resolver,verifier}.ts`

Two layered roles, deliberately separate:

- `resolveNip05(id: Nip05Id, httpClient, options?)` — pure: one lookup, returns `PublicKey | null`. `options.timeoutMs` defaults to `DEFAULT_NIP05_TIMEOUT_MS` (10 s); pass `options.signal` for caller-driven abort.
- `createNip05Verifier({ httpClient, onVerified, signal?, onError?, clock?, timeoutMs? })` — fire-and-forget verifier with per-domain serialisation; calls `onVerified(pubkey, verified, checkedAt)` for each result. Exposes `whenIdle(): Promise<void>` so tests and graceful-shutdown paths can drain deterministically without `setTimeout`-polling. Pass `signal` to drain outstanding queues on logout/teardown; the entry in-flight at the moment of abort is dropped (no `onVerified` fired with a false negative).

App-policy concerns (a `DmCache`, a `DmService` orchestrating live + historical subscriptions, a `Nip05Refresher` with staleness gating) live in consumer applications — they encode app-specific persistence layout and refresh policy and do not belong in the protocol-primitives layer.

### NIP-11 relay information — `src/infrastructure/adapter/nip11-adapter.ts`

`fetchRelayInformation(httpClient, relayHttpUrl)` reads the NIP-11 document via the `HttpClient` port. Use `wsToHttp(url)` (from the value-object barrel) to derive the http URL from a relay's `wss://` URL. Returns `Result<RelayInformation, Nip11FetchError>` — see the Errors section for the tag union.

### Errors

Every error in this package extends `TaggedError<Tag>` — `instanceof TaggedError` catches the whole family, and the literal `tag` field is exhaustively switchable. Downstream `@innis/*` packages compose their own subclasses on the same shape.

- `SigningError` — generic signing-pipeline failure. Thrown by `@innis/nostr-nip07` when no extension is installed, by `@innis/nostr-nip46` for bunker timeouts / disconnects / protocol errors, and by app code wrapping invalid signer config.
- `SignerRejectedError` — user explicitly rejected a signing request. Detect with `isUserRejection(err)` (also matches plain `Error`s whose message contains "rejected" / "denied" / "cancel", for extensions that don't use the typed error).
- `PubkeyMismatchError` — the signer returned an event signed by a different key than expected.
- `SignerError` — discriminated by `SignerErrorTag` (`no-signer | disconnected | decrypt-failed | encrypt-failed`); returned (not thrown) from `Signer.nip04*` / `nip44*`.
- `EncryptionError` — `encryptJson` failed inside an event-building service (`buildDmGiftWraps`, `buildReplaceableListEvent`). Carries the underlying `JsonCryptoError` as `cause` and a short `context` label in the message identifying the caller; downstream apps' write surfaces follow the same wrap shape.
- `JsonCryptoError` — `encryptJson` / `decryptJson` failure (`json-stringify-failed | json-parse-failed | empty-ciphertext | signer-failed`); carries the underlying `SignerError` as `cause` on `signer-failed`.
- `PrivateEntriesParseError` — `decryptPrivateEntries` succeeded at decrypting but the plaintext isn't valid JSON.
- `Nip98ValidationError` — `createNip98Validator` rejection; tagged by `Nip98ErrorTag`. The union has 23 finer-grained tags (`header-too-long`, `header-bad-prefix`, `header-bad-base64`, `header-bad-json`, `header-bad-event`, `kind`, `timestamp`, `expiration-multiple`, `expiration-malformed`, `expired`, `u-missing`, `u-multiple`, `u-malformed`, `u-mismatch`, `method-missing`, `method-multiple`, `method-mismatch`, `payload-multiple`, `payload-unexpected`, `payload-missing`, `payload-mismatch`, `signature`, `replay`) — see `src/domain/exception/nip98-validation-error.ts`.
- `Nip04DecryptError` — codec-level decode failure for NIP-04 (bad base64, wrong IV length, wrong key).
- `Nip44CryptoError` — codec-level encrypt/decrypt failure for NIP-44 (bad MAC, malformed payload, wrong nonce length).
- `GiftWrapUnwrapError` — `unwrapGiftWrap` failure; tagged `not-gift-wrap | seal-decrypt-failed | seal-malformed | seal-wrong-kind | rumor-decrypt-failed | rumor-malformed | rumor-wrong-kind | rumor-pubkey-mismatch`.
- `Nip11FetchError` — `fetchRelayInformation` failure; tagged `transport | body-read | schema-mismatch`. `transport` and `body-read` carry the underlying `HttpRequestError` as `cause`; `schema-mismatch` carries `{ body: unknown }` so consumers can log the offending shape.
- `InvalidBrandError<TName>` (base) and the per-brand `InvalidPublicKeyError`, `InvalidEventIdError`, `InvalidSigError`, `InvalidRelayUrlError`, `InvalidNip05IdError` — thrown by the validating brand constructors.

**Cause contract.** Every `TaggedError` subclass whose role is to wrap an upstream failure accepts an optional `cause` in its constructor and forwards it to `super(...)` — `Nip44CryptoError` carries the vendored-codec throw, `Nip04DecryptError` carries the AES/base64 throw, `SignerRejectedError` carries the NIP-07 `Error`, and so on. `InvalidBrandError` (raw) and `PubkeyMismatchError` (expected/actual) don't expose `cause` because their typed payload fields are the diagnostic; everything else does. The rule is uniform across single-tag and tag-enum subclasses.

### Test helpers — `@innis/nostr-core/testing`

A secondary entry point that ships fixture helpers and a configurable mock signer. Import from
`@innis/nostr-core/testing` (a separate module specifier — keeps test-only symbols out of the
runtime surface):

```ts
import {
  buildEventFixture,
  createEventFactory,
  createMockSigner,
  resetEventFixtureCounter,
} from "@innis/nostr-core/testing"
```

- `buildEventFixture(overrides?)` — return a `NostrEvent`-shaped value with deterministic placeholder
  `id` / `pubkey` / `sig`. The defaults are **not cryptographically valid**; use a real signer
  (e.g. `createLocalSigner`) when you need a signed-and-verifiable event. Uses a module-global
  counter that increments per call.
- `resetEventFixtureCounter()` — reset that shared counter so the next call produces id `0…01` again.
- `createEventFactory({ startAt? })` — return an `EventFactory` with its own private counter for
  parallel-safe suites that need a deterministic, race-free sequence of fixture IDs.
- `createMockSigner({ pubkey, kind?, signEvent?, nip04Encrypt?, ... })` — build a `Signer` for tests.
  Unspecified crypto methods resolve to a `failure(SignerError("no-signer", ...))`. Pass `signEvent`
  to override the default which round-trips through `buildEventFixture`.

### Async helpers — `src/domain/service/timers.ts` + `src/domain/value-object/timestamp.ts`

- `now()` — current unix seconds. **Use this** instead of `Math.floor(Date.now() / 1000)`.
- `debounce(fn, ms)` — trailing-edge debounce.
- `coalesce(fn, ms)` — the first call inside an empty window schedules `fn` to run after `ms`; further calls in the same window are dropped. `fn` is zero-arg, so there is no "trailing call wins" — the schedule is set on the first call and the window resets when it fires. Returns a `CancellableScheduler` with `cancel()`.

### Error utilities — `src/domain/service/error-utils.ts`

- `errorMessage(err)` — extract a message string from any thrown value, including non-`Error` throws.
- `reportUnhandledError(err)` — standard unhandled-promise sink. Use as `.catch(reportUnhandledError)` on fire-and-forget calls; it re-throws in a microtask so the host's uncaught-exception handler picks it up.

## Design conventions (LOCKED)

These decisions are final. Read this section before proposing "consistency" or
"simplification" sweeps that touch any of them.

### Scope: protocol primitives only

`@innis/nostr-core` ships **protocol primitives**, not application policy. The dividing line:

| Lives here | Belongs in the consumer |
|---|---|
| NIP-17 gift-wrap construction & unwrapping | DM conversation/thread cache, persistence layout |
| NIP-19 bech32 codec | Profile fetcher policies, refresh intervals |
| NIP-05 `resolveNip05`, per-domain-serialised verifier | Staleness gating, refresh schedules |
| `HttpClient` port type | Retry policy, backoff, request-batching |
| `Signer` port type, `createLocalSigner` | Signer-selection UI, login flow, NIP-46 bunker pairing UX |

A generic relay-subscription port (e.g. a `DmQueryService`), DM-cache shape
(`createDmCache` / `createDmService`), and NIP-05 refresh-staleness policy
(`createNip05Refresher`) are explicitly out of scope. They are app policy, not protocol
primitives, and belong in consumer applications. Don't add more in that vein.

### Barrel structure

Every layer has its own `mod.ts` that **explicitly** lists what's public from that layer.
The root `mod.ts` does `export *` from each layer barrel — zero curation, mechanical
aggregation. Adding a new export is a **one-line edit** to one layer barrel.

```
src/domain/value-object/mod.ts    ← explicit re-exports (this layer's surface)
src/domain/exception/mod.ts        ← explicit re-exports
src/domain/service/mod.ts          ← explicit re-exports
src/application/exception/mod.ts   ← explicit re-exports
src/application/port/mod.ts        ← explicit re-exports
src/application/service/mod.ts     ← explicit re-exports
src/infrastructure/adapter/mod.ts  ← explicit re-exports
mod.ts (root)                      ← export * from each layer barrel
```

The split is deliberate: each layer barrel is the curated source of truth for that layer's
public surface, while the root barrel is mechanical aggregation. Layer-level curation keeps
review focused on the layer that owns the symbol; root-level `export *` keeps the package
entry point a one-line edit per new export.

### `Signer` interface: throw vs Result

The `Signer` interface uses **two** error conventions, and the split is intentional:

| Method | Returns | Failure mode |
|---|---|---|
| `getPublicKey()` | `Promise<PublicKey>` (throws) | Rare-exceptional (local can't fail; NIP-46 transport blip) |
| `signEvent(template)` | `Promise<NostrEvent>` (throws) | Rare-exceptional (user-rejected on NIP-07, transport on NIP-46) |
| `nip04Encrypt`/`nip04Decrypt` | `Promise<Result<string, SignerError>>` | Expected-failure-mode (bad payload, locked key, peer rejected) |
| `nip44Encrypt`/`nip44Decrypt` | `Promise<Result<string, SignerError>>` | Expected-failure-mode |

The two ways map to the two **semantic** categories — rare-exceptional throw, expected-mode
return. Forcing `Result` on every method would add friction (`if (!r.success)` per call) for
failures that local signers can't even produce; forcing `throw` on the per-message crypto
methods would lose the typed `SignerError` discriminator callers rely on. The split is
locked because each side handles the category it actually fits.

### Event-builder shapes

Small builders use **simple positional args** with sensible defaults. Multi-field builders
use a single input-object parameter.

| Builder | Signature |
|---|---|
| `buildReaction(eventId, authorPubkey, reaction?)` | positional; `reaction` defaults to `"+"` |
| `buildRepost(eventId, authorPubkey, rawEvent?)` | positional |
| `buildHighlightFromUrl(text, sourceUrl, comment?)` | positional |
| `buildHighlightFromEvent(text, source)` | positional |
| `buildDeletion(target)` | positional |
| `buildTextNote(content, replyContext?, createdAt?)` | positional, 3 args |
| `buildLongform(input)` | input-object |
| `buildZapRequest(input)` | input-object |

The small builders set `created_at` internally via `now()`; callers who need a fixed
timestamp post-process the returned `UnsignedEvent` (`{ ...event, created_at: 1700... }`)
before signing. `buildTextNote` and `buildLongform` accept `createdAt` because their
input surfaces (reply context, longform metadata) justify the extra arg; the small
builders carry no such surface and stay positional.

### `build*` vs `create*` verb split

`build*` returns inert **data** — one-shot value producers. `create*` returns a **capability
object** (a closure / function bag) with methods bound inside it. The split is meaningful:

| Verb | Returns | Examples |
|---|---|---|
| `build*` | a value (event / filter / fixture) | `buildTextNote`, `buildReaction`, `buildDmGiftWraps`, `buildEventFilter`, `buildNip98AuthEvent`, `buildEventFixture` |
| `create*` | a capability object with methods | `createBrand`, `createHexBrand`, `createLocalSigner`, `createHttpClient`, `createNip05Verifier`, `createNip98Validator`, `createEventFactory`, `createMockSigner` |

The split is meaningful at the call site: the verb tells a reader whether they're getting
inert data or a stateful capability.

### Result type naming

The Result type pair is `Success<T>` / `Failure<E>`; the factories are `ok()` / `failure()`;
the type guards are `isOk()` / `isFailure()`. Never alias `failure` to anything (the
collision with `@std/assert.fail()` motivated the original rename from `fail` → `failure`).

### Branded primitives

- **`pubkeyFromNip19`, `formatHex`, `parseHex`, `isRecord`** are intentionally kept even
  though they look like thin wrappers. Each earns its place by being the *one* sanctioned
  way to do a thing the rest of the codebase keeps doing — removing any of them just
  scatters the same code across every consumer.
  - `pubkeyFromNip19(input)` — the *generic* "give me a `PublicKey` from any NIP-19 entity
    that carries one" extractor (npub / nprofile / nevent-with-author / naddr). Without it,
    every paste-handling boundary writes its own `decodeNostrEntity` + per-entity branch
    + `"pubkey" in decoded` check. Centralised here, it changes once when a new entity
    type lands.
  - `formatHex` / `parseHex` — project-verb-consistent re-exports of `@noble/hashes/utils`'
    `bytesToHex` / `hexToBytes`. Three reasons they exist as wrappers instead of raw imports:
    (1) every other primitive in the codebase uses the `parseX` / `formatX` verb pair
    (`parsePublicKey` / `formatAddressableRef` / `parseEventId`), so the hex codec matches
    the family; (2) the noble import path can change between major versions — wrapping
    means the upgrade is one file, not a project-wide grep-and-replace; (3) consumers
    already pulling in `@innis/nostr-core` get hex ↔ bytes for free without having to add
    `@noble/hashes` to their own dependency list (and risk version skew with ours).
  - `isRecord(value): value is Record<string, unknown>` — the narrowing form used by
    every `unknown`-typed JSON sink in the library (`tryParseJson`, NIP-11 schema check,
    DM crypto rumor parse, zap-receipt parse). Inlined, it's `typeof value === "object"
    && value !== null && !Array.isArray(value)` — three traps in one line, easy to
    forget the `!Array.isArray` and silently accept arrays as records.
- **`parseX(raw)` is the only sanctioned way to brand** a value. Don't `as PublicKey`
  anywhere.

### Clock & RNG: ambient platform capabilities

`now()` and `randomBytes()` / `randomUint32()` live in `domain/service/` and use
`Date.now()` and `crypto.getRandomValues()` directly. They're treated as **platform
ambient capabilities**, not "infrastructure" in the clean-architecture sense.

For testability, services that derive timestamps or randomness accept optional
injection (`clock?: Clock`, `randomUint32?: RandomUint32Fn`) defaulting to those primitives.
There is no "RNG Port" — the architecture-purity gain didn't justify the friction.

### Existing convention notes (still load-bearing)

- **`*Interface` / `*Adapter` suffixes.** Interfaces in this TS port are named with the TS-idiomatic bare form (`Signer`, `HttpClient`, `Nip05Verifier`) rather than the PHP-ecosystem `*Interface` suffix. Infrastructure adapter *files* end in `-adapter.ts` (e.g. `local-signer-adapter.ts`); the exported factories (`createLocalSigner`, `createHttpClient`) are named for the product, not the category. Deliberate deviation from the cross-repo PHP convention for ergonomics.
- **`RelayInformation.supported_nips` is snake_case** because that field doubles as the NIP-11 wire shape returned by relays' `application/nostr+json` endpoint. Renaming would force every adapter to map snake↔camel and create a second source of truth.
- **NIP-04 throws `Nip04DecryptError`; NIP-44 throws `Nip44CryptoError`** — both extend `TaggedError`. The `Signer` interface wraps both so that `Signer.nip04*` / `Signer.nip44*` callers see only `Result<string, SignerError>`; direct callers of `nip04Decrypt` / `nip44Decrypt` see the tagged errors. NIP-44's class is `Nip44CryptoError` (not `*DecryptError`) because the same error type covers encrypt-time validation (e.g. wrong nonce length) and decrypt-time failure (bad MAC, malformed payload).

## Anti-patterns

- **Calling `signer.nip44Encrypt(pk, JSON.stringify(...))` directly.** Use `encryptJson` / `decryptJson`.
- **Throwing on `nip44*` / `nip04*` failure instead of returning `Result.failure`.** All `Signer` implementations must return `Result` on the crypto methods — including "not supported" cases.
- **Treating `Result<string, SignerError> | null` as "the new shape".** It's `Result<string, SignerError>`. Failure is the `Failure<SignerError>` branch, not `null`.
- **Adding a new event kind without adding it to `kinds.ts`.** No magic numbers in callers.
- **Calling `Math.floor(Date.now() / 1000)`.** Use `now()`.
- **Branding a value with a type assertion (`raw as PublicKey`).** Use the validating `parseX` constructor at every system boundary — it is the only sanctioned way to brand.
- **Reimplementing `replaceableStorageKey` / `isReplaceable` / `parseAddressableRef`.** They live here; use them.
- **Calling `fetch` inside a lib.** Take the `HttpClient` port as a dependency instead — it keeps the lib portable and testable.
- **Throwing from an `HttpClient` implementation.** Map transport failures to `NetworkError` and return `Result.failure`; callers branch on the `Result` and won't catch a thrown error.

## Filter-set hash

`hashFilters` (TypeScript `@innis/nostr-core`) and `FilterHasher::hash` (PHP `@innis/nostr-core`) compute a stable identity for a NIP-01 `REQ` filter set, suitable as a subscription dedup key. Both follow the same canonicalisation spec:

1. Represent the filter set as an ordered list of filters in wire form (TS: `NostrFilter` objects; PHP: `Filter::toArray()`).
2. Canonicalise recursively:
   - **object / map** — sort keys ascending, then canonicalise each value;
   - **array / list** — canonicalise each element, then sort the elements ascending by their canonical JSON encoding;
   - **scalar** — left unchanged.
3. JSON-encode the canonicalised structure compactly, with `/` and non-ASCII left unescaped.
4. The hash is the lowercase-hex **SHA-256** of that canonical string.

Because object keys, array elements, and the filters themselves are all sorted, two filter sets that select the same events produce the same digest regardless of how they were ordered on input.

### Cross-language parity (status)

Each implementation guarantees the property **within its own runtime**, and the two are byte-identical for all-ASCII inputs — event ids, pubkeys, kinds, and ASCII tag values (for example, both hash the empty set `[]` to `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`, and both hash a single empty filter `[{}]` to `e10808d43975dc400731053386849f864f297e6c4f7519c380f3dbaf7067a840`). Full byte-for-byte parity across every input is **not yet guaranteed**. Both remaining divergences are confined to non-ASCII characters in string-valued fields — the NIP-50 `search` string and tag-filter values; ASCII-only filters are byte-identical. Known residual divergences:

- **U+2028 / U+2029 escaping** — PHP's `json_encode` escapes the line- and paragraph-separator code points to `\u2028` / `\u2029` even with `JSON_UNESCAPED_UNICODE`, while TS's `JSON.stringify` emits them raw, so a value containing either yields a different digest.
- **supplementary-plane (astral) collation** — element- and key-sorting compares by UTF-16 code unit (TS) versus UTF-8 byte (PHP); these disagree for astral characters (e.g. emoji) ordered against the U+E000–U+FFFF range.

Each implementation is still internally order-independent regardless. Until a shared conformance vector set locks byte-parity, do not key a **cross-language shared** cache or store off this digest. For same-runtime dedup — the relay pool's use — it is correct today.

## Credits

- **NIP-44 v2 implementation** (`src/infrastructure/crypto/nip44-v2.ts`) is vendored from [paulmillr/nip44](https://github.com/paulmillr/nip44/) — specifically [`javascript/index.ts`](https://github.com/paulmillr/nip44/blob/8205ff7e7fd4e8309bbba43ca45a6baa00c3ec5e/javascript/index.ts) at commit `8205ff7e`. Released under [The Unlicense](https://unlicense.org/) (public domain). Behaviour-preserving adaptations (noble v2 import paths, local base64 codec, type tightenings) are documented at the top of the file. The adapter at `src/infrastructure/adapter/nip44-adapter.ts` re-throws into the domain-typed `Nip44CryptoError`.
- **Cryptographic primitives** come from [paulmillr/noble-curves](https://github.com/paulmillr/noble-curves), [paulmillr/noble-hashes](https://github.com/paulmillr/noble-hashes), and [paulmillr/noble-ciphers](https://github.com/paulmillr/noble-ciphers) — also by Paul Miller.
- **NIP specifications** live at [nostr-protocol/nips](https://github.com/nostr-protocol/nips).

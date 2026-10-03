# @innis/nostr-core

[![CI](https://github.com/johninnis/nostr-core-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-core-ts/actions/workflows/ci.yml)

The foundation. Branded primitives, event utilities, the `Signer`, `PeerCipher` and `HttpClient` interfaces, NIP-19 / NIP-05 encoding, kind constants, the `Result` type, and the returned `*Failure` values and thrown `*Error` faults the ecosystem shares. Every other `@innis/*` package depends on it.

NIP-44 v2 is vendored from [paulmillr/nip44](https://github.com/paulmillr/nip44/) (see [Credits](#credits)); Schnorr / secp256k1, SHA-256 and AES come from the `@noble/*` libraries. `defaultLocalSignerTools` exports a ready-made bag of all of these — drop it straight into `createLocalSigner`, or pass your own `LocalSignerTools` to swap any of them out (an alternate NIP-44 implementation, or a stub in tests). Every tool receives the secret key bytes, so a key that never leaves its device — a hardware signer — is a `Signer` of its own, not a set of tools.

Test helpers ship from the secondary entry point `@innis/nostr-core/testing` — see [Test helpers](#test-helpers). A runnable walkthrough lives in [`examples/walkthrough.ts`](examples/walkthrough.ts). The reasoning behind the design is recorded in [`docs/adr/`](docs/adr/).

## Install

```sh
deno add jsr:@innis/nostr-core
```

## Getting started

```ts
import { buildTextNote, createLocalSigner, generateSecretKey, verifyEventSignature } from "jsr:@innis/nostr-core"

const signer = createLocalSigner(generateSecretKey()) // defaults to defaultLocalSignerTools

const signed = await signer.signEvent(buildTextNote("hello nostr"))
if (signed.success) verifyEventSignature(signed.value) // true — synchronous
```

`createLocalSigner` derives the public key from the secret key, builds the event's id through `buildRumour` (which throws `InvalidArgumentError` for a template that is not a NIP-01 event, so `signEvent` rejects rather than sign one), and asks its tools for a Schnorr signature over that id. In-browser code typically uses `@innis/nostr-nip07` (extension signer) or `@innis/nostr-nip46` (remote bunker signer) instead.

## What it provides

`@innis/nostr-core` is the shared contract layer of the `@innis/*` packages: protocol primitives and the ports they run through, with no relay transport ([ADR-0001](docs/adr/0001-the-package-ships-protocol-primitives-and-the-ports-they-need-not-application-policy.md)).

- **Branded primitives.** `PublicKey`, `EventId`, `Sig`, `RelayUrl`, `Nip05Id` and the rest are branded strings produced by `parseX(raw)`, which returns the value or `null` ([ADR-0006](docs/adr/0006-brands-parse-untrusted-input-to-a-nullable-value-isvalidx-checks-canonical-form.md)).
- **A `Signer` port.** One interface that `@innis/nostr-nip07`, `@innis/nostr-nip46` and `createLocalSigner` all satisfy; every method returns a `Result`, so a caller tells `disconnected` from `decrypt-failed` by its type ([ADR-0002](docs/adr/0002-every-signer-method-returns-a-result.md)).
- **An `HttpClient` port.** Packages that touch HTTP take an `HttpClient`; `createHttpClient` is the `fetch`-backed default, and tests pass an in-memory one.
- **Returned failures, thrown faults.** An anticipated "no" is a plain `*Failure` value in the return type; only a broken invariant or misuse throws an `*Error` (see [Failures and errors](#failures-and-errors)).
- **No transport.** Relay pools, relay selection and event stores are `@innis/nostr-relay-pool`, `@innis/nostr-relay-selection` and `@innis/nostr-event-store`.

For a batteries-included toolkit without ports or branded primitives, [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) is the alternative.

## Stability

`0.x` — the API is in active use by the sibling `@innis/*` packages, but breaking changes remain possible before `1.0`. Pin a minor version if that matters to you.

## Public surface

### Branded types

- `PublicKey`, `EventId`, `Sig`, `RelayUrl`, `HttpUrl`, `Nip05Id`, `SubscriptionId` — branded `string` types for the core identifiers.
- `NostrEvent`, `Rumour`, `UnsignedEvent`, `Tag` — event shapes; `NostrFilter` — relay query filter, whose tag conditions are `#` plus one letter `a`–`z` / `A`–`Z` and whose `ids`, `authors`, `#e` and `#p` take branded lowercase hex (NIP-01).
- `Result<T, E>` — discriminated union with `ok(value)`, `failure(error)`, `isOk(r)`, `isFailure(r)`.

Each branded primitive has two functions, and they always agree:

- `parseX(raw: unknown): X | null` — canonicalises (a NIP-05 id keeps its `a-z0-9-_.` local part as written, refusing any other, and lower-cases its domain, which must be ASCII: an internationalised name travels as punycode; only whitespace around the whole id is trimmed, and whitespace inside it is refused) and brands, or returns `null`. Hex is never case-folded: NIP-01 ids, pubkeys and signatures are lowercase, so `parsePublicKey("A".repeat(64))` is `null`; lower-casing what a person typed is the input edge's job. It never throws: use it wherever untrusted input enters. `parsePublicKey`, `parseEventId`, `parseSig`, `parseNip05Id`, `parseRelayUrl`, `parseHttpUrl` (an absolute `http` or `https` URL in the one form NIP-98 compares it in: scheme and host lower-cased, the default port, credentials and fragment dropped, an absent path written `/`, path and query exactly as written; a host outside RFC 3986's grammar — a space, a backslash, a non-ASCII letter — is `null`; shared ADR-0081), `parseAuthChallenge` (a NIP-42 challenge: any non-empty string, compared with the constant-time `authChallengesEqual`), `parseSubscriptionId` (NIP-01: a well-formed string of 1–64 code points), and the NIP-57 zap addresses `parseLightningAddress` and `parseLnurl` (see [Parsing and reading events](#parsing-and-reading-events)).
- `isValidX(raw): raw is X` — `true` only for a value already in canonical form, that is exactly when `parseX(raw) === raw`.

Never brand with a type assertion (`raw as PublicKey`). In tests, brand known-good literals with the fixtures from `@innis/nostr-core/testing`.

`createBrand({ canonicalise })` and `createHexBrand(length)` are the factories the library itself uses; they return `{ parse, is }` with the same contract, so downstream packages can define their own brands. `isLowercaseHex(value, length)` is the check behind `createHexBrand`, for a hex value that is not a brand.

`parseRelayUrl(url)` returns `RelayUrl | null`. A relay URL is canonical after these rules: it is trimmed; only RFC 3986 URL characters are allowed (whitespace, non-ASCII, backslash, quotes, `<>`, `{}`, `|`, `^`, apostrophe and `#` are rejected, so fragments are rejected); any `@` before the host (credentials, even empty) is rejected; a percent-encoded C0 control, space or DEL (`%00`–`%20`, `%7F`) anywhere is rejected; the scheme must be `ws` or `wss`, and scheme and host are lowercased; the host must be well-formed labels with no empty label and no percent-encoding (`ws://%41.b` is rejected, never decoded); a host whose last label is numeric (decimal or `0x` hex) must be a canonical dotted-quad IPv4 (`127.1`, `0x7f.0.0.1` and `127.0.0.01` are rejected); a port that is not plain digits (`:+80`, `:1e3`) and port 0 are rejected, and a default or empty port dropped; an empty authority (`wss:///relay.example.com`) is rejected; dot segments (including `%2e`) are resolved; a trailing run of `/` and `,.;!` is stripped; `//` in the path, the host repeated in the path, a second `ws(s)://` after the host, and anything over 200 characters are rejected; an empty query is dropped. Every canonical output is a fixed point. The same rules run in `@innis/nostr-relay-selection` and the PHP nostr-core, checked against one shared corpus. `toRelayUrls(urls)` normalises an array and dedupes by canonical form; `wsToHttp(relay)` gives a `RelayUrl`'s own URI under `http(s)` as an `HttpUrl`, where NIP-11 and NIP-86 serve.

`AddressableEventRef` is `{ kind, pubkey, dTag }`, the NIP-01 coordinate. `formatAddressableRef(ref)` produces `kind:pubkey:d`; `parseAddressableRef(value)` is its strict inverse, returning `null` for malformed input, including a kind with a sign or a leading zero; the identifier is any string, newlines included. An empty `dTag` is a valid address.

`EventOrAddressRef` is the one representation of a pointer to a parent event: `{ type: "event", id } | { type: "address", address }`. `formatEventOrAddressRef(ref)` gives its canonical string form and is the key to use in a `Map` / `Set`. `parseEventOrAddressRef(value)` reads wire or stored data exactly as written: a hex id, a `kind:pubkey:d` coordinate or a bare `note1…` / `nevent1…` / `naddr1…` entity (a `nostr:` prefix or space around it gives `null`; what a person typed goes through `parseNostrInput`, ADR-0037), keeping only the pointer, so an `nevent`'s or `naddr`'s relay hints are dropped (`decodeNostrEntity` keeps them); `eventOrAddressRefFromTag(tag)` reads one from an `e` / `E` / `a` / `A` tag. A NIP-22 comment can also thread to external content (NIP-73), an `ExternalContentRef` `{ type: "external", id, kind, hint }` from its `I` / `i` value, `K` / `k` value and the web page its `I` / `i` tags state, read in its NIP-98 URL form as one claim (`null` when none is stated, when the tags disagree, or when a hint is no `http` or `https` URL, which is dropped; shared ADR-0090); `ThreadRef` is `EventOrAddressRef | ExternalContentRef`, keyed by `formatThreadRef(ref)`.

### Kinds, tags and replaceable events

- `KIND_*` constants — every kind the library understands. `REPOST_KINDS` / `isRepostKind`, and `kindCategory(kind)`: the NIP-01 category `"regular" | "replaceable" | "ephemeral" | "addressable"`, total, with every kind outside the three ranged categories regular. `isValidAddressableRef(ref)` is `true` for an addressable kind with any `d`, or a replaceable kind with the empty `d`; `parseAddressableRef` and `naddr` accept nothing else.
- `getDTag(tags)` — the `d` tag value, `""` when there is none, or `null` when `d` tags disagree. `replaceableStorageKey(event)` — the `pubkey:kind[:d]` cache key (not the `a`-tag form; use `formatAddressableRef` for that). `replaceableSupersedes(candidate, existing)` — NIP-01 newer-wins with the lowest-id tie-break.
- Generic tag helpers: `soleTagValue` (a `SoleTagValue`: `{ state: "one", value }` for the one value a single-valued tag carries, a repeated value being one claim; `{ state: "absent" | "disagreeing", value: null }` when no tag carries one or the tags name different values, shared ADR-0014; a reader that wants only the value reads `.value`), `extractTagValues` (each value once, in the order first tagged, the empty string included: an empty value is the empty string, not absence, shared ADR-0079), `hasTag` / `addTag` / `removeTag` (by `name + value`). Typed readers: `extractPubkeys`, `extractEventIds` (each valid value once, in the order first tagged), `extractEventRefs` (each `{ id, relayHint, author }`, the hint a canonical `RelayUrl` or `null` when absent or not a relay URL, the author the tag's fifth element when it has one (the NIP-10 slot), else its fourth (where NIP-22 and NIP-25 write it), `null` when that is not a public key, shared ADR-0012).
- NIP-65 relay tags: `extractRelayEntries(tags)`, `hasRelayEntry(tags, url)`, `getRelayEntryMarker(tags, url)`, `addRelayTag(tags, url, marker?)`, `removeRelayTag(tags, url)`, `setRelayEntryUsage(tags, url, { read?, write? })`. They take a `RelayUrl` and compare `r` tags by canonical form, so `wss://Relay.com/` in a tag matches `wss://relay.com`. `addRelayTag` is an upsert: it leaves exactly one `r` tag for the relay, in canonical form, carrying the new marker. `getRelayEntryMarker` reads every `r` tag for the relay, so one marked `read` and another `write` read as `both`, and a marker NIP-65 does not define reads as `both`. `setRelayEntryUsage` turns a direction on or off, removing the relay's tags when neither is left and otherwise writing them as one canonical `r` tag, and returns `tags` itself when nothing changes.
- `hashtag.ts` — `normaliseHashtag` (lower-cases, `null` for the empty string; no trimming and no `#` stripping — strip a typed `#` at the input edge), `extractHashtags(content)`, `findHashtags(content)` (each hashtag's `index`, its `text` as written and its bare `tag`, for a renderer that links them; no `#` inside a URL is one, shared ADR-0071), and `eventHasHashtag(event, hashtag)` (a `t` tag or an untagged hashtag in the content, case-insensitive).
- `emoji.ts` — NIP-30: `parseEmojiTags(tags)` (shortcode to image URL, unchecked — sanitise before rendering) and `emojiShortcodePattern()` (a new global pattern each call).
- `reaction.ts` — `DEFAULT_REACTION` (`"+"`), the NIP-25 like.

### Event builders

Each returns an `UnsignedEvent` to hand to a `Signer`. A builder that answers or references an event takes that event itself (ADR-0027), plus, where the NIP gives it one, the relay it can be found on.

| Builder | Signature |
|---|---|
| `buildTextNote` | `(content, createdAt?)` — a kind 1 note that answers nothing; auto-tags hashtags and `nostr:` references |
| `buildReply` | `(content, parent, hint?)` — the one reply builder: a NIP-10 kind 1 note to a kind 1 parent, otherwise a NIP-22 kind 1111 comment (ADR-0028) |
| `buildReaction` | `(target, reaction = "+", relay?)` — NIP-25 kind 7: `["e", id, relay, author]`, `["p", author, relay?]`, `["k", kind]`, and `["a", coordinate, relay, author]` for an addressable target only (NIP-25 asks for `a` only there, shared ADR-0077) |
| `buildRepost` | `(target: NostrEvent, relay)` — NIP-18 kind 6 for a kind 1 note, else kind 16 with `k`; the `e` tag carries the required relay, a replaceable or addressable target also gets `a`; the content is the target's JSON, empty for a NIP-70 protected event |
| `buildDeletion` | `(author, target)` — a published event of `author`'s: its `a` coordinate when replaceable or addressable, else its `e` id, and a `k` tag (NIP-09); throws `InvalidArgumentError` for another author's event (shared ADR-0086) |
| `buildHighlightFromUrl` | `(text, sourceUrl, comment?)` — the source, an `HttpUrl`, is `["r", url, "source"]` (NIP-84) |
| `buildHighlightFromEvent` | `(text, source)` — the source event's `a` coordinate when it has one, its `e` id and its author's `p` (NIP-84) |
| `buildClientAuth` | `(relay, challenge: AuthChallenge)` — NIP-42 |
| `buildPrivateMessage` | `({ sender, receivers }, content, replyTo?)` — the sender's kind-14 rumour with a `p` tag per receiver other than the sender, the room's other members; a reply names `replyTo` in an `e` tag (NIP-17). A room with no member besides the sender is a note to self, its one `p` tag naming the sender (shared ADR-0074) |
| `buildPrivateReaction` | `({ sender, receivers }, target, reaction?)` — the sender's kind-7 rumour reacting to a message of a NIP-17 room: a `p` tag per receiver other than the sender, so it stays in that room, with the target's author last, the sender included when it wrote the target (NIP-25), plus `e` and `k`; in a note-to-self room the one `p` tag names the sender, as in `buildPrivateMessage`. Throws `InvalidArgumentError` for a target whose author is not in the room (shared ADR-0074) |
| `buildRelayList` | `(tags, content?)` — kind 10002 |
| `buildAppSettings` | `(dTag, content)` — kind 30078 |
| `buildMetadata` | `(metadata)` — kind 0; `metadata` is a JSON object, typed `T & JsonSerialisable<T>` as `createJsonCipher`'s `encrypt` takes it, so a parsed `JsonValue` record goes back unchanged; one that is no JSON object throws `InvalidArgumentError` |
| `buildLongform` | `({ kind: KIND_LONGFORM_CONTENT \| KIND_LONGFORM_CONTENT_DRAFT, dTag, content, title?, summary?, image?, topics?, publishedAt?, createdAt? })` — topics become lowercase `t` tags via `normaliseHashtag`; an empty `title` or `summary` is written as an empty tag, an absent one is not (shared ADR-0079); `image` is an `HttpUrl` |
| `buildZapRequest` | `({ recipientPubkey, relayUrls, amountMillisats, target?, lnurl?, comment?, createdAt? })` — NIP-57 Appendix A; `relayUrls` is a non-empty list of `RelayUrl`, `lnurl` an `Lnurl`, and a `target` event adds `e`, `k` and, when addressable, `a` (NIP-57 gives the `a` coordinate to addressable events only, shared ADR-0077); an `amountMillisats` that is not a whole number of at least 1 throws `InvalidArgumentError` |
| `buildFileMetadataEvent` / `buildImetaTag` | NIP-94 from a `FileEventMetadata` (a `FileMetadata` stating `m`, `x` and `ox`) / NIP-92 from a `FileMetadata`; `buildImetaTag` returns `null` for a `url` alone, since NIP-92 needs "at least one other field"; both throw `InvalidArgumentError` for a `size` that is not a non-negative safe integer, which no reader would read back |

`buildReply` takes the parent event itself, or an `ExternalContentRef`, and picks the kind from it: a kind 1 parent gets a kind 1 note, anything else a kind 1111 comment, so a kind 1 reply to another kind — which NIP-10 forbids and NIP-23 forbids for articles — cannot be built. The thread's root is read from the parent's own tags, and the optional `hint` is where the parent can be found (`ReplyHint`): a `RelayUrl` for an event, and none for external content, whose own `hint` is its web page, an `HttpUrl` (shared ADR-0090), or for a parent typed as either, which a caller narrows before giving a hint.

- Kind 1: a direct reply has `["e", parent, hint, "root", author]`; a deeper one keeps the parent's root `e` tag (relay and author included) and adds `["e", parent, hint, "reply", author]`. The `p` tags are the parent's author, every pubkey in the parent's own `p` tags, and the root's author, once each.
- Kind 1111: the root scope (`A` for an addressable root, else `E`, with `K` and `P`) is the parent, or a parent comment's own root scope (including an `I` scope, whose hint is copied in its web page form or dropped) when that comment names a root and its `K`, with a `P` for the root's author from its `A` coordinate or `E` tag when the comment carries none — a comment naming none is itself the root; the parent is named by `e` (plus `a` when addressable), `k` and `p`, and `P` / `p` carry the hint. External content (a URL, a podcast episode, …) is both root and parent: `["I", id, hint?]`, `["K", kind]`, `["i", id, hint?]`, `["k", kind]`, where the hint is a web page.

`buildTextNote` and `buildReply` turn every `note`, `nevent` and `naddr` mention in the content into a NIP-18 `["q", <event-id or address>, <relay>, <pubkey if a regular event>]` tag: the relay is the entity's first relay hint, and the pubkey is an `nevent`'s author unless it states a kind that is not regular; an `naddr` carries none. An `npub` / `nprofile`, and a quoted event's known author, become `p` tags, the author's before its quote; hashtags become `t` tags after them. A target the content names more than once gets one tag, written where it is last named, that keeps in each slot the first non-empty relay or author any of its mentions gave, so a bare `note` after an `nevent` keeps the `nevent`'s hints; a content tag with the name and value of a reply's thread tag is left out, so the thread tag keeps its place and its relay. Both builders tag the same content the same way as innis/nostr-core (shared ADR-0076).

Every builder of an addressable event writes a `d` tag, the empty string when there is no identifier; `getDTag` reads an absent `d` tag as that empty string.

Small builders stamp `created_at` with `now()`; spread an unsigned result to pin it, and re-stamp a rumour (`buildPrivateMessage`, `buildPrivateReaction`) through `buildRumour({ ...rumour, created_at: t })`, which hashes its id anew.

### Parsing and reading events

- `parseNostrInput(input)` — what a person typed or pasted: an `npub` / `nprofile` / `note` / `nevent` / `naddr`, bare or as a `nostr:` URI, with space around it (ADR-0037). A bare hex string is not read: it may be an event id or a pubkey, and only the caller knows which. Returns `{ type: "event", id, relayHints } | { type: "profile", pubkey, relayHints } | { type: "address", address, relayHints }` or `null`. `buildEventFilter(parsed)` turns an event or address into a filter (`null` for a profile); `buildAddressableEventFilter(ref)` is the filter for the current event at an address (it omits `#d` for plain replaceable kinds).
- `parseNostrEvent(value)` — validates a signed event's shape (kind an integer 0–65535, `created_at` a non-negative integer) and returns exactly its seven NIP-01 fields, or `null`. `isValidKind(value)` is the kind check it applies.
- `analyseEvent(event)` — an `AnalysedEvent`, `{ raw, refs, kindData }`. `refs` is its `ReplyChain`: `rootEvent`, `replyToEvent` and `isReply` (the one way to decide reply-ness: a kind 1 or 1111 event that resolves a root or parent; `q` tags play no part, a kind 1 note threads by `e` tags only, and a comment prefers its `A` / `a` address over an `E` / `e` id, and either over an `I` / `i` external id paired with its `K` / `k` (shared ADR-0085), and an `e` marker NIP-10 does not define reads as none). The root and the parent are read independently: a note with one unmarked `e` tag replies to it and names no root (NIP-10's positional scheme), and nothing copies the parent into an absent root; read `rootEvent ?? replyToEvent` for the thread to open (ADR-0023). `kindData` is its `KindMetadata`, `null` or one of `{ type: "repost" | "reaction" | "highlight" | "longform", … }`; a repost's `original`, a reaction's `target` and a highlight's `source` are the `EventOrAddressRef` it points at. A highlight's `sourceUrl` is the one web (`http` / `https`) URL its `r` tags marked `source` name, else the one web URL its `r` tags not marked `mention` name (NIP-84), each read through `parseHttpUrl` and held as an `HttpUrl`, so a value that does not parse is never the source; tags naming different URLs name none (shared ADR-0087, shared ADR-0014). An optional field whose tag is present and empty (a longform `title` or `summary`, a highlight `context` or `comment`) reads as `""`, not `null`; `null` means the tag is absent (shared ADR-0079). A longform `image` is read through `parseHttpUrl` and held as an `HttpUrl`, `null` when it is absent or not an `http` or `https` URL, an empty one included. `replyTargetRef(event)` is the ref a reply to `event` carries: the coordinate for a replaceable (`kind:pubkey:`) or addressable (`kind:pubkey:d`) event, otherwise its id; an addressable event whose `d` tags disagree is named by its id.
- `parseRelayMessage(raw)` / `serialise{Req,Event,Close,Auth}Message(...)` — the relay wire protocol. A subscription id is a `SubscriptionId`, a well-formed string of 1–64 code points, so a lone surrogate is refused; `OK` and `CLOSED` must carry their message and expose its machine-readable prefix as `reason` (`parseReasonPrefix`): a refusal (`OK` false, `CLOSED`) whose message names no standardised prefix is `"error"`, NIP-01's prefix "for when none of that fits", so only an accepting `OK` has `reason: null`; `NOTICE` carries a non-empty message (shared ADR-0099); `AUTH` carries a non-empty `AuthChallenge`; `COUNT` carries a non-negative integer `count` and `approximate`. Every message needs the elements its type defines, and elements after them (an `EOSE` hint, say) are ignored (shared ADR-0091). `serialiseReqMessage` leaves out every filter that can match nothing and returns `null` when none is left: a `REQ` that selects nothing is not sent (ADR-0029).
- `compileFilter(filter)` / `compileFilters(filters)` — NIP-01 filter matching, compiled once and reused: `compileFilter(filter).matches(event)`. A tag filter for `""` matches a tag carrying the empty value. An empty list, a `#` key that is not one letter, or a `since` after the `until` matches nothing (NIP-01 lists hold "one or more values"); `canFilterMatch(filter)` is that test. A NIP-50 `search` matches content holding every whitespace-separated term, case-insensitively, ignoring each `key:value` extension (a key starting with a letter and holding only letters, digits, `_` and `-`, a colon, and a non-empty value with no `:` or `/`, such as `language:en`; a URL or a time like `12:30` stays a term), so a search of only extensions matches what the rest of the filter matches (shared ADR-0082). `limit` is ignored.
- `hashFilters(filters)` — a stable SHA-256 of a filter set's canonical form (see [Filter-set hash](#filter-set-hash)).
- `parseZapReceipt(event)` reads a NIP-57 receipt carrying exactly one `description` (a signed kind-9734 zap request, whose author is the sender) and one `bolt11` (the amount, which every request `amount` tag must equal) into a `ZapReceipt`; it verifies nothing. `verifyZapReceipt(receipt, lnurlProviderPubkey, expectedLnurl?: Lnurl)` applies NIP-57 Appendix F and checks both signatures, returning a `ZapReceiptVerificationFailure` when it fails. `parseBolt11Amount(invoice)` reads whole satoshis, rounded down, from the `lnbc` / `lntb` / `lntbs` / `lnbcrt` human-readable part; a mixed-case invoice is malformed (BIP-173) and has no amount.
- `parseZapAddress(raw)` reads where a NIP-57 recipient takes zaps: a LUD-16 `LightningAddress` (`lud16`, `username@domain`: a username of `a-z0-9-_.`, plus `+` for a tag, as written, domain lower-cased as for NIP-05) or else a LUD-01 `Lnurl` (`lud06`, bech32 under the `lnurl` prefix, all upper or all lower case, up to 5000 characters, lowercased), `ZapAddress | null`. An LNURL must encode an `https` URL, or `http` on an onion host. `payEndpointUrl(address)` is the LNURL-pay endpoint's URL: `https://<domain>/.well-known/lnurlp/<name>` (`http` for an onion domain), or the URL the LNURL encodes. `parseLightningAddress` / `isValidLightningAddress` and `parseLnurl` / `isValidLnurl` read one form. `lnurlOf(address)` is the `Lnurl` of the pay endpoint — for a Lightning address, its LUD-16 URL bech32-encoded — for a zap request's `lnurl` tag and `verifyZapReceipt`'s `expectedLnurl`. Nothing here fetches the endpoint (ADR-0024).
- `isEventExpired(event, at)` — NIP-40: expired once any `expiration` tag names a time at or before `at`; a value that is not a canonical decimal (a sign, a leading zero) is no expiry and is ignored.
- `parseNutzap` (NIP-61: proofs in `sat`, the default, or `msat`; any other unit has no sat amount), `parseFileMetadataEvent` (a kind 1063 must state `url`, an `m` that is a MIME type, and SHA-256 hex `x` and `ox`, the fields NIP-94 does not mark optional), `parseFileMetadataTags`, `parseImetaTag`, `parseImetaTags`. An `imeta` tag with a `url` and no other field this reads is refused (NIP-92), so a tag whose only other field is one it drops reads as nothing, as `buildImetaTag` would write it, as is an empty `url`; a `size` is read only as canonical decimal digits, with no leading zero (shared ADR-0096), an `m` only as a MIME type (`parseMimeType`: an RFC 6838 `type/subtype` of restricted names, read in any case and returned lowercase, NIP-94: "The MIME types format must be used"), and any other empty field is kept as the empty string (shared ADR-0079). `buildFileMetadataEvent` and `buildImetaTag` throw `InvalidArgumentError` for an empty `url` or an `m` that is not a lowercase `type/subtype`, and `buildFileMetadataEvent` also for an `x` or `ox` that is not SHA-256 hex.

### Encoding — NIP-19, NIP-27, JSON and hashing

- `encodePubkeyToNpub`, `encodeEventIdToNote`, `encodeNprofile(pubkey, relays?)`, `encodeNevent(id, { relayUrls?, authorPubkey?, kind? })`, `encodeNaddr(ref, relays?)`. Relay hints are `RelayUrl`s, so only canonical relay URLs are encoded (shared ADR-0084). The three TLV encoders return `null` for what the decoder would reject: an identifier over the 255 bytes a TLV length can hold, a kind outside 0–65535, an `naddr` that is not `isValidAddressableRef`, or a result over NIP-19's 5000 characters.
- `decodeNostrEntity(str)` reads a bare entity exactly as written — a `nostr:` URI or space around it is `null`, as in innis/nostr-core (ADR-0037) — and returns `DecodedNpub` / `DecodedNote` / `DecodedNprofile` / `DecodedNevent` / `DecodedNaddr` (the latter carrying `address: AddressableEventRef`) or `null`; decoded relay hints are normalised `RelayUrl`s. Every decoded entity carries `pubkey` — the key it encodes, an `nevent`'s author or an `naddr`'s, or `null` for a `note` and an authorless `nevent` — so `decodeNostrEntity(input)?.pubkey` is the pubkey any identifier names. A `special`, `author` or `kind` record repeated with one value is read once; repeats that disagree name nothing (an `nevent` then has no author or kind, and an entity missing a required record is `null`), and a malformed record of either kind refuses the entity (shared ADR-0094). `stripNostrUriPrefix(input)` trims and drops a `nostr:` prefix, for text a person typed that may be something other than an entity.
- `extractContentReferences(content)` returns every NIP-27 reference in content that decodes, in order, as `{ match, identifier, index, entity }`; `leadingContentReference(content)` reads one only at the start of the content, for tokenisers. `buildTextNote` and `buildReply` derive their `p` / `q` tags from these.
- `parseJson(text)` returns `Result<JsonValue, JsonParseFailure>` (a string, number, boolean, `null`, or a readonly array or object of those) — `ok(null)` for the JSON `null`, `failure("malformed-json")` for malformed text, and for text holding an unpaired surrogate, which no UTF-8 text can carry (shared ADR-0104).
- `parseHex` / `formatHex` — lowercase hex ↔ bytes; `parseHex` returns `null` for odd-length or non-lowercase-hex input and never throws.
- `serialiseEvent(event)` — a signed event as NIP-01 JSON: its seven fields in NIP-01 order and no other key the object carries. Every event this package writes (an `EVENT` or `AUTH` message, a repost's content, a NIP-98 header, a gift-wrapped seal) goes through it.
- `verifyEventSignature(event)`, `sha256Hex(data)` — both synchronous. An event's id is computed in one place, behind `buildRumour` and `verifyEventSignature`: the NIP-01 array hashed as `JSON.stringify` writes it, so a control character other than NIP-01's seven is written as a `\u00XX` escape, as every JSON encoder writes it, rather than verbatim (shared ADR-0105, local ADR-0036).
- `constantTimeEqual(a, b)` — compare secrets without early exit.

### HTTP port

```ts
import type { HttpRequest, HttpResponse, Result } from "@innis/nostr-core"

type HttpRequestFailure =
  | { readonly type: "network"; readonly message: string }
  | { readonly type: "server"; readonly status: number; readonly message: string }

interface HttpClient {
  readonly request: (input: HttpRequest) => Promise<Result<HttpResponse, HttpRequestFailure>>
}
```

`HttpRequest` is `{ url, method, headers?, body?, signal?, followRedirectTo?, maxBodyBytes? }`. `signal` aborts the request and any pending body read; a deadline is a signal too (`AbortSignal.timeout(ms)`, combined with the caller's own through `AbortSignal.any`). The last two are the request's policy for what it fetches, and each is safe when omitted: no redirect followed, the default body ceiling (ADR-0025, ADR-0026). `HttpResponse` exposes `status`, `headers`, and single-shot body readers `text()` and `blob()` returning `Promise<Result<T, NetworkFailure>>`, and `json()` returning `Promise<Result<JsonValue, NetworkFailure | MalformedBodyFailure>>`, its `JsonValue` as `parseJson` reads it.

- Transport failure (DNS, refused, aborted, CORS) → `Failure(NetworkFailure)` whose `message` describes the thrown value.
- Without `followRedirectTo`, a redirect is never followed: a 301, 302, 303, 307 or 308 → `Failure(ServerFailure)` with its `status` (`0` for a browser's opaque redirect) and a `message` naming the `Location`. NIP-05: "Fetchers MUST ignore any HTTP redirects". With it, the redirect is followed and a landing URL the predicate rejects → `Failure(NetworkFailure)` — Blossom's BUD-01, for one, lets a blob `GET` redirect only to a URL carrying the same hash.
- Status ≥ 400 → `Failure(ServerFailure)` with `status`; `message` is the `x-reason` header, else the first 8 KiB of the body.
- Any other status below 400, a `304 Not Modified` included → `Success(HttpResponse)` with its `status` and the body unread. A body over the request's `maxBodyBytes` (or the client's default) fails its reader with a `NetworkFailure`; a body `json()` cannot read as UTF-8 JSON is a `MalformedBodyFailure` `{ type: "malformed-body", message }`, since the exchange itself succeeded.

`createHttpClient(privateAddresses?, fetch?)` is the default `fetch`-backed client; `fetch` swaps the transport. Only `fetch`'s own transport failure or abort becomes a `NetworkFailure`; anything else it throws propagates. A request without `maxBodyBytes` is capped at `DEFAULT_MAX_BODY_BYTES`, 16 MiB (ADR-0025). Built with `"refuse-private"`, the default, it refuses, without fetching, a URL whose host is `localhost` or a private, loopback or link-local literal address, and a followed redirect that lands on one; built with `"allow-private"` it reaches them. A host uses the refusing client for targets someone else names and holds an allowing one for the targets its user chose (their relays, their media servers); a DNS name that resolves to a private address is the host's to block at its egress (ADR-0032). In-memory test clients must mirror the result shapes.

`readJsonDocument(response)` is the one reader of a JSON document an `HttpClient.request` answered with: `Result<Readonly<Record<string, JsonValue>>, JsonFetchFailure>`, the JSON object the server sent, where `JsonFetchFailure` is `{ type: "not-found" }` for a 404 or `NoAnswerFailure` `{ type: "no-answer", message }` for anything else, a body that is not a JSON object included (local ADR-0015, shared ADR-0040). NIP-05 resolution and the NIP-11 fetch read their documents with it, each `GET`ting without following a redirect and under the default body ceiling.

### Signer and PeerCipher

```ts
import type { NostrEvent, PublicKey, Result, SignerFailure, UnsignedEvent } from "@innis/nostr-core"

type PeerCipherFn = (pubkey: PublicKey, text: string) => Promise<Result<string, SignerFailure>>

interface PeerCipher {
  readonly nip04Encrypt: PeerCipherFn
  readonly nip04Decrypt: PeerCipherFn
  readonly nip44Encrypt: PeerCipherFn
  readonly nip44Decrypt: PeerCipherFn
}

interface Signer extends PeerCipher {
  readonly kind: "local" | "extension" | "bunker"
  readonly getPublicKey: () => Promise<Result<PublicKey, SignerFailure>>
  readonly signEvent: (event: UnsignedEvent) => Promise<Result<NostrEvent, SignerFailure>>
}
```

Every method returns a `Result` and none throws an anticipated outcome (ADR-0002). `SignerFailure.type` is `no-signer | disconnected | rejected | pubkey-mismatch | public-key-failed | sign-failed | decrypt-failed | encrypt-failed`, with the signer's `message`; a user's decline is `rejected` from every method, and a signer that does not support NIP-04 returns a failure. A local signer's `getPublicKey` and `signEvent` always succeed. NIP-04 is deprecated and present only for legacy interop.

`checkPubkeyMatches(expected, actual)` is the one place a signer checks it signed as the expected identity: it returns a `pubkey-mismatch` `SignerFailure`, or `null`; a signer with an account-switch hook runs it when the failure is returned. `isUserRejection(message)` is the one place a signer adapter recognises a decline in a free-text error (shared ADR-0041).

### JSON over a cipher, NIP-51 lists

- `createJsonCipher(cipher, scheme?)` returns `{ encrypt(pubkey, value), decrypt(pubkey, ciphertext) }` — the one way to round-trip JSON over a peer cipher, `encrypt` returning `Result<string, SignerFailure>`, since encrypting fails only when the signer does, and `decrypt` `Result<JsonValue, JsonDecryptFailure>`. `encrypt` takes a `T & JsonSerialisable<T>`, so the compiler refuses `undefined`, a function, a bigint and an un-narrowed `unknown`; past a cast, a value `JSON.stringify` writes nothing for throws `InvalidArgumentError` before the signer is asked. The `CipherScheme` is `"nip44"` unless `"nip04"` is passed for a legacy peer; there is no automatic fallback. `cipherSchemeOf(ciphertext)` reads a received payload's scheme from the payload itself (`?iv=` is NIP-04). `decrypt` accepts any JSON, `null` included; callers validate the shape. All take a `PeerCipher`, so any `Signer` works.
- `decryptPrivateEntries(cipher, list)` — a NIP-51 list event's encrypted private tags, from its author, NIP-04 for legacy content carrying `?iv=` and NIP-44 otherwise, `Result<ReadonlyArray<Tag>, PrivateEntriesFailure>`: `signature-invalid` when the list's signature does not verify (NIP-44 validates the event before decrypting), `json-shape-mismatch` when the payload is not an array, or a `JsonDecryptFailure`.
- `buildReplaceableListEvent({ kind, dTag?, visibility, current: { publicTags, privateTags, content }, modifyTags, cipher, authorPubkey, createdAt? })` — applies `modifyTags` to one half of a list, compares the result by value, and returns `Result<{ type: "unchanged" } | { type: "changed", template, nextPrivateTags }, SignerFailure>`. `buildNewListEvent({ kind, dTag?, visibility, entries?, cipher, authorPubkey, createdAt? })` builds a new list. Private entries are always written with NIP-44. `kind` and `dTag` must name a list's coordinate, a replaceable kind with no `dTag` or an addressable kind with any (`isValidAddressableRef`), or both throw `InvalidArgumentError`; only an addressable list is written with a `d` tag.

### Local signer and codecs

```ts
import type { EventId, PublicKey, Sig, Signer } from "@innis/nostr-core"

interface LocalSignerTools {
  readonly getPublicKey: (secretKey: Uint8Array) => PublicKey
  readonly schnorrSign: (id: EventId, secretKey: Uint8Array) => Sig
  readonly nip04Encrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, plaintext: string) => string
  readonly nip04Decrypt: (secretKey: Uint8Array, peerPubkey: PublicKey, ciphertext: string) => string
  readonly getNip44ConversationKey: (secretKey: Uint8Array, peerPubkey: PublicKey) => Uint8Array
  readonly nip44Encrypt: (conversationKey: Uint8Array, plaintext: string) => string
  readonly nip44Decrypt: (conversationKey: Uint8Array, ciphertext: string) => string
}

declare function createLocalSigner(secretKey: Uint8Array, tools?: LocalSignerTools): Signer
```

`createLocalSigner` keeps the NIP-44 conversation keys of its 128 most recently used peers, so it stays bounded however many peers it decrypts from, each gift wrap's throwaway key among them, and a payload that fails to decrypt leaves no key behind. `generateSecretKey()` returns a fresh secret key. The raw codecs — `nip44Encrypt(conversationKey, plaintext)` (always a fresh random nonce), `nip44Decrypt`, `getNip44ConversationKey`, `nip04Encrypt(secretKey, peerPubkey, plaintext)`, `nip04Decrypt` — are synchronous and throw `Nip44CryptoError` / `Nip04CryptoError` (`nip04Decrypt` with the one message `NIP-04 decryption failed` for every payload it cannot decrypt, and for any outside 52–87472 characters; either codec for a peer key that is not a curve point, and for a decrypted plaintext that is not valid UTF-8, which a `Signer` reports as `decrypt-failed`; a plaintext's leading byte order mark is kept, shared ADR-0100); prefer `createJsonCipher` over a signer. `nip04Encrypt` refuses a plaintext over 65567 UTF-8 bytes with `Nip04CryptoError`, which a `Signer` reports as `encrypt-failed`: its payload would be longer than the 87472 characters `nip04Decrypt` reads (shared ADR-0018). Both encrypting codecs refuse a plaintext holding a lone surrogate, which has no UTF-8 encoding, with `Nip04CryptoError` / `Nip44CryptoError` (a `Signer` reports `encrypt-failed`) rather than sealing U+FFFD in its place (shared ADR-0100).

NIP-44 tells an implementation to enforce its own maximum payload size, so the codecs take a plaintext ceiling: `nip44Encrypt(conversationKey, plaintext, maxPlaintextSize?)` and `nip44Decrypt(conversationKey, payload, maxPlaintextSize?)` default it to `NIP44_DEFAULT_MAX_PLAINTEXT_SIZE`, 262144 bytes (256 KiB), and a caller may raise it as far as `NIP44_MAX_PLAINTEXT_SIZE`, NIP-44's own 4294967295 bytes (`NIP44_MIN_PLAINTEXT_SIZE` is 1). Encryption refuses an empty plaintext or one over the ceiling, naming the ceiling (`Plaintext length must be between 1 and 262144 bytes` at the default, as innis/nostr-core words it), so the codec never writes what it will not read. Decryption refuses a payload longer than a plaintext of the ceiling produces (349620 characters at the default) by its length alone, before any character of it is read, then reports a payload starting with `#` as an unsupported version (`unknown encryption version`) whatever its length, then refuses one under 132 characters, and refuses a decrypted plaintext over the ceiling. It also refuses, as `invalid padding`, a payload whose padding bytes are not all zero, as innis/nostr-core does (ADR-0016). `defaultLocalSignerTools` use the default; a host that exchanges larger plaintexts gives `createLocalSigner` tools whose `nip44Encrypt` and `nip44Decrypt` pass its ceiling. A plaintext of 65536 bytes or more is written in NIP-44's extended length format, which a peer on the earlier NIP-44 cannot decrypt. The ceiling bounds the decryption, not what the host has already read: a host that reads untrusted payloads also bounds the frame or body carrying them where it first reads it, such as `@innis/nostr-relay-pool`'s 256 KiB message size or an HTTP request's body ceiling (shared ADR-0102).

### NIP-98 HTTP auth

- `buildNip98AuthEvent({ url, method, body?, expiresInSeconds?, createdAt? })` — synchronous; `url` is an `HttpUrl`, so the `u` tag is already in the form the validator compares (shared ADR-0081); hashes a non-empty `body`, text or bytes (an uploaded file), into a `payload` tag and adds an `expiration` tag `expiresInSeconds` after `created_at` when asked.
- `encodeAuthHeader(signedEvent)` / `parseAuthHeader(header)` — the `Authorization: Nostr <base64>` value, at most 4096 characters: encoding returns `null` for a longer one, which parsing refuses (shared ADR-0106); the `Nostr` scheme token matches in any case (RFC 9110), parsing does not verify the signature, and it fails with an `AuthHeaderDecodeFailure`.
- `createNip98Validator(replayGuard, timestampTolerance?, clock?)` — `replayGuard` is the host's `Nip98ReplayGuard` store; `timestampTolerance` is how many seconds `created_at` may lie from the clock either way (`DEFAULT_TIMESTAMP_TOLERANCE_SECONDS`, 60), and one that is not a safe integer of at least 0 throws `InvalidArgumentError` — returns `{ validate, validateAuthHeader }`, resolving to the signer's `PublicKey` or a `Nip98ValidationFailure` literal naming the failed check (`validateAuthHeader` can also return the `AuthHeaderDecodeFailure`). `validateAuthHeader` takes the body as text or bytes. A non-empty body requires a `payload` tag equal to its lowercase-hex SHA-256 (`bodyHash`, when given, is that hash); an empty body forbids one, and the empty body's hash given as `bodyHash` is no body; an event is refused once `isEventExpired`. The `u` tag and the request URL must be the same once both are in that one form: a dot segment, an empty `?`, a percent-encoding or the path's case is a difference, and a `u` tag whose scheme is not `http` or `https` is `u-malformed`. The request `url` is the server's own, an `HttpUrl`.

### NIP-17 private messages

- `buildUnsignedEvent(template)` — the template's four NIP-01 fields, or `InvalidArgumentError` for one `parseNostrEvent` would refuse; every `Signer`'s `signEvent` (local, NIP-07, NIP-46) runs it first, so each rejects the same programmer error the same way. An addressable kind with no `d` tag gains `["d", ""]` (shared ADR-0007). Synchronous.
- `buildRumour(event)` — attaches the computed id to an unsigned event, producing a `Rumour`; the one gate every event this package signs or wraps passes. Throws `InvalidArgumentError` for an event `parseNostrEvent` would refuse (a `kind` outside 0–65535, a `created_at` that is not a non-negative safe integer). An addressable kind with no `d` tag gains `["d", ""]` before it is hashed, as `buildUnsignedEvent` adds it and innis/nostr-core's `Rumour::draft` does (shared ADR-0007). Synchronous.
- `buildDmGiftWraps({ signer, createEphemeralSigner, rumour, clock?, randomUint32? })` — one gift wrap to each member of the chat room the rumour names (its `pubkey` and its `p` tags, as `chatRoomMembers` reads them), the sender included, each once (ADR-0030), `Result<ReadonlyArray<GiftWrapTarget>, SignerFailure>`. `createEphemeralSigner` returns a fresh throwaway signer per wrap, e.g. `() => createLocalSigner(generateSecretKey())`. A signer that refuses to encrypt or sign returns its own `SignerFailure`, and a signer whose key is not the rumour's author returns `pubkey-mismatch` before anything is encrypted (NIP-17: the seal's pubkey must be the rumour's). A gift wrap carries a serialised rumour of at most `GIFT_WRAP_MAX_RUMOUR_SIZE`, 163840 UTF-8 bytes: the seal holds the rumour's NIP-44 payload, about four thirds of its padded length, and is encrypted again under the same 262144-byte default ceiling, so the next padded length, 196608, gives a seal over it. A larger rumour returns `encrypt-failed` whose message names that limit, before anything is encrypted, whatever ceiling the signer applies, since a recipient at the default could not open its wrap (local ADR-0035, shared ADR-0102).
- `unwrapGiftWrap(cipher, event)` — accepts a kind-1059 gift wrap or a kind-21059 ephemeral gift wrap and returns `Result<{ rumour, senderPubkey }, GiftWrapUnwrapFailure>` for a rumour of any kind (14 messages, 15 file messages, 7 reactions, …); dispatch on `rumour.kind`. The gift wrap and the seal must carry valid signatures (`wrap-signature-invalid`, `seal-signature-invalid`), a seal's only tags may be `expiration` tags each naming a decimal Unix timestamp (NIP-17 asks for the wrap's expiration on the seal too), or it is `seal-malformed`, a layer that decrypts to text that is not JSON is `seal-malformed` or `rumour-malformed`, the rumour must be unsigned (NIP-59: "The inner event MUST always be unsigned"), or it is `rumour-signed`, and is then read by `parseRumour`, so one without an `id` is `rumour-malformed`. Failures: `not-gift-wrap | wrap-signature-invalid | seal-decrypt-failed | seal-malformed | seal-wrong-kind | seal-signature-invalid | rumour-decrypt-failed | rumour-signed | rumour-malformed | rumour-id-mismatch | rumour-pubkey-mismatch`. A rumour whose author is not the seal's signer is `rumour-pubkey-mismatch`, since NIP-17 says otherwise "any sender can impersonate any other".
- `chatRoomMembers(rumour)` — the NIP-17 chat room a rumour belongs to: its author and every `p`-tagged pubkey, sorted and once each; two rumours share a room exactly when these are equal.
- `parseRumour(value)` — reads a rumour, which must state its `id` (NIP-17: "Fields `id` and `created_at` are required"), refusing one without as `rumour-malformed` and one whose `id` its fields do not compute to as `rumour-id-mismatch` (shared ADR-0073); `Result<Rumour, RumourParseFailure>` (`rumour-malformed | rumour-id-mismatch`). Synchronous.

### NIP-05

- `resolveNip05(httpClient, id, signal?)` — `Result<PublicKey | null, NoAnswerFailure>`: `ok(pubkey)` when the domain maps the name, `ok(null)` when it answers without one (including a 404; the name is matched exactly, never case-folded), `failure` when there is no answer to judge (a redirect included). `signal` aborts the lookup; without one it is bounded by `DEFAULT_NIP05_TIMEOUT_MS` (10 s).
- `createNip05Verifier(httpClient, { onVerified, onLookupFailed?, onError }, signal?)` — a fire-and-forget verifier, serialised per domain, reporting to a `Nip05VerifierListener`. `onError` receives a fault thrown inside a queued lookup; the host decides where it goes (ADR-0018). `onVerified(pubkey, verified)` fires only when the domain answered (the host stamps its own time on it); a failed lookup goes to `onLookupFailed(pubkey, failure)` and can be retried. `whenIdle()` resolves when the queue drains; each lookup is bounded by `DEFAULT_NIP05_TIMEOUT_MS`, and aborting `signal` cancels it and drops pending entries without a verdict.

### NIP-11

`fetchRelayInformation(httpClient, relay, signal?)` takes the `RelayUrl` and reads its information document from the same URI under `http(s)` (NIP-11) with `Accept: application/nostr+json`, `Result<RelayInformation, JsonFetchFailure>`: `not-found` for a 404, `no-answer` for anything else, including a body that is not a JSON object. Use `wsToHttp` for the URL. `signal` aborts the lookup; without one it is bounded by `DEFAULT_NIP11_TIMEOUT_MS` (10 s). A relay at a private address is reached only through a client built with `"allow-private"`, which the host passes only for a relay its user chose: only the host knows where the URL came from. `parseRelayInformation` reads a document already in hand.

### Clock, randomness and utilities

`now()` returns Unix seconds; `Clock` types a clock dependency. `randomBytes` is `@noble/hashes`' Web Crypto source, the one the NIP-44 codec draws from, and `randomUint32` reads four of its bytes. `isRecord`, `isArrayOf`, `isStringArray`, `isNumberArray` are the shared guards.

### Failures and errors

An anticipated "no" is returned as plain data named `*Failure` — no class, no stack, discriminated on its literal or its `type`, never with `instanceof`. A fault is thrown as an `Error` subclass named `*Error`.

| Failure | Shape | Returned by |
|---|---|---|
| `SignerFailure` | `{ type: "no-signer" \| "disconnected" \| "rejected" \| "pubkey-mismatch" \| "public-key-failed" \| "sign-failed" \| "decrypt-failed" \| "encrypt-failed", message }` | every `Signer` method, `checkPubkeyMatches`, `createJsonCipher`'s `encrypt`, `buildDmGiftWraps`, `buildReplaceableListEvent`, `buildNewListEvent` |
| `JsonParseFailure` | `"malformed-json"` | `parseJson` |
| `JsonDecryptFailure` | `{ type: "json-parse-failed" \| "empty-ciphertext" }` or `{ type: "signer-failed", cause: SignerFailure }` | `createJsonCipher`'s `decrypt` |
| `PrivateEntriesFailure` | `{ type: "signature-invalid" \| "json-shape-mismatch" }` or a `JsonDecryptFailure` | `decryptPrivateEntries` |
| `GiftWrapUnwrapFailure` | a literal naming the failed step | `unwrapGiftWrap` |
| `RumourParseFailure` | `"rumour-malformed" \| "rumour-id-mismatch"` | `parseRumour` |
| `AuthHeaderDecodeFailure` | a literal naming what the header lacks | `parseAuthHeader`, `validateAuthHeader` |
| `Nip98ValidationFailure` | a literal naming the failed check | `createNip98Validator` |
| `ZapReceiptVerificationFailure` | `"provider-pubkey-mismatch" \| "lnurl-mismatch" \| "receipt-signature-invalid" \| "zap-request-signature-invalid"` | `verifyZapReceipt` |
| `HttpRequestFailure` | `NetworkFailure` `{ type: "network", message }` or `ServerFailure` `{ type: "server", status, message }` | `HttpClient` |
| `MalformedBodyFailure` | `{ type: "malformed-body", message }` | `HttpResponse.json()` on a body that is not UTF-8 or not JSON |
| `JsonFetchFailure` | `{ type: "not-found" }` or `NoAnswerFailure` `{ type: "no-answer", message }` | `readJsonDocument`, `fetchRelayInformation` (`resolveNip05` and `onLookupFailed` get only `NoAnswerFailure`) |

| Error (thrown) | By |
|---|---|
| `Nip04CryptoError`, `Nip44CryptoError` | the raw NIP-04 / NIP-44 codecs, for input they refuse; `createLocalSigner` converts these, and only these, into a `SignerFailure`. A malformed key of the caller's own — a secret or conversation key that is not 32 bytes, a secret key outside the secp256k1 scalar range, a peer key that is not 64 lowercase hex characters — is misuse and throws `InvalidArgumentError` instead |
| `InvalidArgumentError` | a builder given an argument outside its contract: `buildUnsignedEvent` and `buildRumour` for a template that is not a NIP-01 event (so every `Signer`'s `signEvent` too), `buildMetadata`, `buildLongform`, `buildZapRequest`, `buildDeletion`, `buildPrivateReaction`, `buildReply`, `buildFileMetadataEvent`, `buildImetaTag`, `buildNip98AuthEvent`, and `buildReplaceableListEvent` / `buildNewListEvent` for a `kind` and `dTag` that name no list |
| `InvalidArgumentError` | a NIP-04 / NIP-44 codec or `createLocalSigner` given a malformed key of the caller's own (a secret key that is not 32 bytes or not a secp256k1 scalar from 1 to n − 1, the all-zero key included), `createJsonCipher`'s `encrypt` given a value `JSON.stringify` writes nothing for, `compileFilter` and `canFilterMatch` given a filter field forced to `null`, and the test fixtures given a value that is not one |
| `InvalidArgumentError` | `nip44Encrypt` or `nip44Decrypt` given a `maxPlaintextSize` that is not an integer from 1 to `NIP44_MAX_PLAINTEXT_SIZE` |
| `InvalidArgumentError` | `createNip98Validator` given a `timestampTolerance` that is not a safe integer of at least 0 |
| `InvariantError` | a value the library produced that breaks its own contract — a broken primitive or a bug, never the caller's input |

Every one of them extends the abstract `NostrError`, never thrown itself, so a host tells a fault this library raised from anything else that throws with `error instanceof NostrError`.

### Test helpers — `@innis/nostr-core/testing`

```ts
import { buildEventFixture, createStubSigner, publicKeyFixture } from "@innis/nostr-core/testing"
```

- `publicKeyFixture`, `eventIdFixture`, `sigFixture`, `nip05IdFixture`, `relayUrlFixture`, `httpUrlFixture`, `authChallengeFixture`, `subscriptionIdFixture`, `lightningAddressFixture`, `lnurlFixture` — brand a known-good literal, throwing on a typo.
- `buildEventFixture(overrides?)` — a pure `NostrEvent`-shaped value: the same overrides build the same event, its `id` is the NIP-01 id of its fields unless overridden, and its `sig` is a placeholder that does not verify.
- `buildSignedEventFixture(secretKey, overrides?)` — the same event signed by `secretKey`, for code that verifies what it reads (`unwrapGiftWrap`, `decryptPrivateEntries`): its `pubkey` is the key's and its `sig` verifies.
- `createStubSigner({ pubkey, kind?, signEvent?, nip04Encrypt?, nip04Decrypt?, nip44Encrypt?, nip44Decrypt? })` — a `Signer` for tests; `getPublicKey` resolves to `ok(pubkey)`, `signEvent` (a `StubSignerSignFn` returning a `Result`) defaults to `ok` of a fixture, each cipher override is a `StubSignerCipherFn` that may answer synchronously, and an unset one fails with `no-signer`.

## Filter-set hash

`hashFilters` (TypeScript) and `FilterHasher::hash` (PHP) compute the same stable identity for a NIP-01 `REQ` filter set:

1. Represent the filter set as an ordered list of filters in wire form.
2. Canonicalise recursively: sort object keys ascending (bytewise); canonicalise each array element, then sort the elements by their canonical encoding; leave scalars unchanged.
3. Encode as ASCII-safe JSON: compact, `/` unescaped, every non-ASCII code unit escaped as a lowercase `\uXXXX` (astral characters as surrogate pairs).
4. The hash is the lowercase-hex SHA-256 of that string.

Filter sets that select the same events, differing only in key, element or filter order, hash equal. Both test suites assert these anchors:

| Input | SHA-256 digest |
|---|---|
| `[]` (empty set) | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `[{}]` (one empty filter) | `e10808d43975dc400731053386849f864f297e6c4f7519c380f3dbaf7067a840` |
| `[{ "kinds": [2,1], "limit": 5 }]` | `a34519033f2032b87a019ef94f4be40fc1ab6a621d2b66c55b0d386c3e576587` |
| `[{ "search": "U+2028" }]` | `aee96085e5802e7b70a145ffdf6aa7e2335469aa223be66c79c9ad1699ecd7f2` |
| `[{ "search": "U+1F600" }]` (astral) | `ac283a84cb87cd19a956f552a82cb9155fc1a980d576356c4d987e71710a4dd3` |
| `[{ "#t": ["U+1F600","U+1F4A9"] }]` (astral sort) | `a47382ebe89a655c3d9d1e27a1e5e445ca0dd4f5348e72f518b2a98b6f77f92b` |

## Anti-patterns

- Calling `signer.nip44Encrypt(pk, JSON.stringify(...))` directly — use `createJsonCipher`.
- Throwing from a `Signer`'s cipher methods, or from an `HttpClient` — return a failure.
- Branding with a type assertion (`raw as PublicKey`) — use `parseX` and handle `null`.
- A magic kind number — add it to the `KIND_*` constants.
- `Math.floor(Date.now() / 1000)` — use `now()`.
- Re-implementing `replaceableStorageKey`, `kindCategory`, `parseAddressableRef`, `getDTag` or `buildAddressableEventFilter`.
- Calling `fetch` inside a library — take the `HttpClient` port.

## Credits

- **NIP-44 v2 implementation** (`src/infrastructure/crypto/nip44-v2.ts`) is vendored from [paulmillr/nip44](https://github.com/paulmillr/nip44/) — [`javascript/index.ts`](https://github.com/paulmillr/nip44/blob/8205ff7e7fd4e8309bbba43ca45a6baa00c3ec5e/javascript/index.ts) at commit `8205ff7e`, released under [The Unlicense](https://unlicense.org/). Its divergences from upstream are listed at the top of the file. Divergences 1 to 4, adaptations to the noble v2 APIs and a subarray fix, change no output. Divergences 5 to 8 change behaviour: decryption refuses a plaintext that is not valid UTF-8 and keeps a byte order mark (5); NIP-44's extended length format encrypts and decrypts plaintexts of 65536 bytes or more (6); decryption refuses padding whose bytes are not all zero (7); and a payload starting with `#` is reported as an unknown encryption version however short it is, after the codec's maximum length and before the minimum (8).
- **Cryptographic primitives** come from [paulmillr/noble-curves](https://github.com/paulmillr/noble-curves), [paulmillr/noble-hashes](https://github.com/paulmillr/noble-hashes) and [paulmillr/noble-ciphers](https://github.com/paulmillr/noble-ciphers).
- **NIP specifications** live at [nostr-protocol/nips](https://github.com/nostr-protocol/nips).

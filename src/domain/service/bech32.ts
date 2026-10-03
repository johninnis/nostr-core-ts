import { concatBytes } from "@noble/hashes/utils"
import { bech32 } from "@scure/base"
import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import { isValidAddressableRef } from "../value-object/addressable-ref.ts"
import type { EventId } from "../value-object/event-id.ts"
import { parseEventId } from "../value-object/event-id.ts"
import { brandBytes, formatHex } from "./hex.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { toRelayUrls } from "../value-object/relay-url.ts"
import { trimSpaceAndNul } from "../value-object/trim.ts"
import { isValidKind } from "../value-object/kinds.ts"
import type { SoleTagValue } from "../value-object/sole-tag-value.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"
import { decodeUtf8, textEncoder } from "./text-codec.ts"

const MAX_ENTITY_LENGTH = 5000
const MAX_TLV_VALUE_LENGTH = 255

const TLV_SPECIAL = 0
const TLV_RELAY = 1
const TLV_AUTHOR = 2
const TLV_KIND = 3

/** A decoded bech32 string: its human-readable prefix, lowercased, and its payload bytes. */
export interface Bech32Decoded {
  readonly hrp: string
  readonly bytes: Uint8Array
}

/**
 * Decode `str` as bech32 of at most 5000 characters, NIP-19's bound, which also covers LNURLs longer than BIP-173's 90;
 * `null` when it is not, including mixed case.
 */
export const decodeBech32 = (str: string): Bech32Decoded | null => {
  const decoded = bech32.decodeUnsafe(str, MAX_ENTITY_LENGTH)
  const bytes = decoded && bech32.fromWordsUnsafe(decoded.words)
  return decoded && bytes ? { hrp: decoded.prefix, bytes } : null
}

const encodeBech32 = (hrp: string, bytes: Uint8Array): string => bech32.encode(hrp, bech32.toWords(bytes), false)

const CHECKSUM_LENGTH = 6

/** Encode `bytes` as bech32 under `hrp`, or `null` when the result would pass NIP-19's 5000 characters. */
export const encodeBech32Bounded = (hrp: string, bytes: Uint8Array): string | null => {
  const words = bech32.toWords(bytes)
  return hrp.length + 1 + words.length + CHECKSUM_LENGTH > MAX_ENTITY_LENGTH
    ? null
    : bech32.encode(hrp, words, MAX_ENTITY_LENGTH)
}

interface TlvEntry {
  readonly type: number
  readonly value: Uint8Array
}

const parseTlv = (bytes: Uint8Array): ReadonlyArray<TlvEntry> | null => {
  const entries: Array<TlvEntry> = []
  let i = 0
  while (i < bytes.length) {
    const type = bytes[i]
    const length = bytes[i + 1]
    if (type === undefined || length === undefined) return null
    i += 2
    if (i + length > bytes.length) return null
    entries.push({ type, value: bytes.subarray(i, i + length) })
    i += length
  }
  return entries
}

const KIND_BYTES = 4

const readKind = (bytes: Uint8Array): number | null => {
  if (bytes.length !== KIND_BYTES) return null
  const kind = new DataView(bytes.buffer, bytes.byteOffset, KIND_BYTES).getUint32(0)
  return isValidKind(kind) ? kind : null
}

// Deliberate: repeated records are one claim only when every copy agrees and none is malformed — see shared ADR-0094
/** The one value the `type` records claim, or `null` when any of them is malformed. */
const soleRecord = <T extends string | number>(
  entries: ReadonlyArray<TlvEntry>,
  type: number,
  read: (bytes: Uint8Array) => T | null,
): SoleTagValue<T> | null => {
  const values = entries.filter((e) => e.type === type).map((e) => read(e.value))
  const wellFormed = values.filter((value) => value !== null)
  return wellFormed.length === values.length ? soleValue(wellFormed) : null
}

const tlvExtractRelays = (entries: ReadonlyArray<TlvEntry>): ReadonlyArray<RelayUrl> =>
  toRelayUrls(entries.filter((e) => e.type === TLV_RELAY).flatMap((e) => decodeUtf8(e.value) ?? []))

/** Decoded NIP-19 `npub1…` payload — carries the already-branded `PublicKey`. */
type DecodedNpub = { readonly type: "npub"; readonly pubkey: PublicKey }
/** Decoded NIP-19 `note1…` payload — carries the already-branded `EventId`, and no pubkey. */
type DecodedNote = { readonly type: "note"; readonly eventId: EventId; readonly pubkey: null }
/** Decoded NIP-19 `nprofile1…` payload — pubkey plus optional relay hints (TLV type 1). */
type DecodedNprofile = {
  readonly type: "nprofile"
  readonly pubkey: PublicKey
  readonly relays: ReadonlyArray<RelayUrl>
}
/** Decoded NIP-19 `nevent1…` payload — event id plus optional relay hints, author pubkey, and kind. */
type DecodedNevent = {
  readonly type: "nevent"
  readonly eventId: EventId
  readonly relays: ReadonlyArray<RelayUrl>
  readonly pubkey: PublicKey | null
  readonly kind: number | null
}
/**
 * Decoded NIP-19 `naddr1…` payload — the addressable-event coordinate, its author's pubkey, and optional relay hints.
 */
type DecodedNaddr = {
  readonly type: "naddr"
  readonly address: AddressableEventRef
  readonly pubkey: PublicKey
  readonly relays: ReadonlyArray<RelayUrl>
}

// Deliberate: every entity names its pubkey, or null, so a caller finds it without branching on type — see ADR-0003
/**
 * Discriminated union returned by `decodeNostrEntity` — branch on `.type` to access the entity-specific fields. Every
 * member carries `pubkey`: the key an `npub` or `nprofile` encodes, an `nevent`'s author or `null`, an `naddr`'s
 * author, and `null` for a `note`.
 */
type DecodedEntity = DecodedNpub | DecodedNote | DecodedNprofile | DecodedNevent | DecodedNaddr

const pubkeyOf = (bytes: Uint8Array): PublicKey | null => bytes.length === 32 ? parsePublicKey(formatHex(bytes)) : null

const eventIdOf = (bytes: Uint8Array): EventId | null => bytes.length === 32 ? parseEventId(formatHex(bytes)) : null

const decodeNprofile = (entries: ReadonlyArray<TlvEntry>): DecodedNprofile | null => {
  const pubkey = soleRecord(entries, TLV_SPECIAL, pubkeyOf)?.value ?? null
  return pubkey === null ? null : { type: "nprofile", pubkey, relays: tlvExtractRelays(entries) }
}

const decodeNevent = (entries: ReadonlyArray<TlvEntry>): DecodedNevent | null => {
  const eventId = soleRecord(entries, TLV_SPECIAL, eventIdOf)?.value ?? null
  const author = soleRecord(entries, TLV_AUTHOR, pubkeyOf)
  const kind = soleRecord(entries, TLV_KIND, readKind)
  if (eventId === null || author === null || kind === null) return null
  return { type: "nevent", eventId, relays: tlvExtractRelays(entries), pubkey: author.value, kind: kind.value }
}

const decodeNaddr = (entries: ReadonlyArray<TlvEntry>): DecodedNaddr | null => {
  const dTag = soleRecord(entries, TLV_SPECIAL, decodeUtf8)?.value ?? null
  const pubkey = soleRecord(entries, TLV_AUTHOR, pubkeyOf)?.value ?? null
  const kind = soleRecord(entries, TLV_KIND, readKind)?.value ?? null
  if (dTag === null || pubkey === null || kind === null) return null
  const address = { kind, pubkey, dTag }
  return isValidAddressableRef(address) ? { type: "naddr", address, pubkey, relays: tlvExtractRelays(entries) } : null
}

const decodeTlvEntity = (hrp: string, bytes: Uint8Array): DecodedEntity | null => {
  const entries = parseTlv(bytes)
  if (entries === null) return null
  if (hrp === "nprofile") return decodeNprofile(entries)
  if (hrp === "nevent") return decodeNevent(entries)
  if (hrp === "naddr") return decodeNaddr(entries)
  return null
}

/**
 * Decode a bare NIP-19 bech32 entity (`npub`, `note`, `nprofile`, `nevent`, `naddr`), exactly as written: a `nostr:`
 * URI or space around the entity is user input, read by `parseNostrInput` (ADR-0037). Returns `null` for anything
 * NIP-19 does not allow: a string over 5000 characters, mixed case, a truncated TLV stream, a missing or malformed
 * required record, a present but malformed optional record, an `naddr` identifier that is not valid UTF-8, a kind
 * outside 0–65535, or an `naddr` that is not {@link isValidAddressableRef}. Text records are read as UTF-8 exactly as
 * written, a byte order mark included; a relay hint that is not valid UTF-8 is dropped like any other hint with no
 * canonical relay URL form. TLV types NIP-19 does not define are ignored. A record repeated with one value is read
 * once; records of one type that disagree name nothing, so an `nevent`'s author or kind is then `null` and an entity
 * missing its required record is `null`.
 */
export const decodeNostrEntity = (str: string): DecodedEntity | null => {
  const decoded = decodeBech32(str)
  if (!decoded) return null
  const { hrp, bytes } = decoded

  if (hrp === "note") {
    const eventId = eventIdOf(bytes)
    return eventId ? { type: "note", eventId, pubkey: null } : null
  }
  if (hrp === "npub") {
    const pubkey = pubkeyOf(bytes)
    return pubkey ? { type: "npub", pubkey } : null
  }
  return decodeTlvEntity(hrp, bytes)
}

const buildTlv = (entries: ReadonlyArray<TlvEntry>): Uint8Array | null =>
  entries.some(({ value }) => value.length > MAX_TLV_VALUE_LENGTH)
    ? null
    : concatBytes(...entries.flatMap(({ type, value }) => [Uint8Array.of(type, value.length), value]))

const encodeBytes = (str: string): Uint8Array => textEncoder.encode(str)

const relayEntries = (relayUrls: ReadonlyArray<RelayUrl>): ReadonlyArray<TlvEntry> =>
  [...new Set(relayUrls)].map((url) => ({ type: TLV_RELAY, value: encodeBytes(url) }))

const encodeTlvEntity = (hrp: string, entries: ReadonlyArray<TlvEntry>): string | null => {
  const bytes = buildTlv(entries)
  return bytes === null ? null : encodeBech32Bounded(hrp, bytes)
}

const encodeKind = (kind: number): Uint8Array | null => {
  if (!isValidKind(kind)) return null
  const bytes = new Uint8Array(KIND_BYTES)
  new DataView(bytes.buffer).setUint32(0, kind)
  return bytes
}

/** Encode a 32-byte hex public key as its NIP-19 `npub1...` string. */
export const encodePubkeyToNpub = (pubkey: PublicKey): string => encodeBech32("npub", brandBytes(pubkey))

/** Encode a 32-byte hex event ID as its NIP-19 `note1...` string. */
export const encodeEventIdToNote = (eventId: EventId): string => encodeBech32("note", brandBytes(eventId))

/**
 * Encode an `nprofile1...` containing `pubkey` and optional relay hints (NIP-19 TLV type 1), each a canonical
 * `RelayUrl` written once, at its first position (shared ADR-0084). Returns `null` when the result would exceed 5000
 * characters.
 */
export const encodeNprofile = (pubkey: PublicKey, relayUrls: ReadonlyArray<RelayUrl> = []): string | null =>
  encodeTlvEntity("nprofile", [{ type: TLV_SPECIAL, value: brandBytes(pubkey) }, ...relayEntries(relayUrls)])

/**
 * The optional fields of the `nevent` `encodeNevent` encodes — relay hints (TLV type 1), author pubkey (TLV type 2) and
 * kind (TLV type 3). One input object because each is a field of that one entity.
 */
export interface EncodeNeventOptions {
  readonly relayUrls?: ReadonlyArray<RelayUrl>
  readonly authorPubkey?: PublicKey
  readonly kind?: number
}

/**
 * Encode an `nevent1...` containing `eventId` and optional relay hints (canonical `RelayUrl`s, each written once at its
 * first position, shared ADR-0084) / author pubkey / kind. Returns `null` when the kind is outside NIP-01's 0–65535, or
 * the result would exceed 5000 characters.
 */
export const encodeNevent = (eventId: EventId, options: EncodeNeventOptions = {}): string | null => {
  const entries: Array<TlvEntry> = [
    { type: TLV_SPECIAL, value: brandBytes(eventId) },
    ...relayEntries(options.relayUrls ?? []),
  ]
  if (options.authorPubkey !== undefined) entries.push({ type: TLV_AUTHOR, value: brandBytes(options.authorPubkey) })
  if (options.kind !== undefined) {
    const kind = encodeKind(options.kind)
    if (kind === null) return null
    entries.push({ type: TLV_KIND, value: kind })
  }
  return encodeTlvEntity("nevent", entries)
}

/**
 * Encode an `naddr1...` for an addressable event coordinate, with optional relay hints (canonical `RelayUrl`s, each
 * written once at its first position, shared ADR-0084). Returns `null` for what {@link decodeNostrEntity} would reject:
 * a coordinate that is not {@link isValidAddressableRef}, an identifier longer than 255 bytes, or a result over 5000
 * characters.
 */
export const encodeNaddr = (address: AddressableEventRef, relayUrls: ReadonlyArray<RelayUrl> = []): string | null => {
  const kind = encodeKind(address.kind)
  if (kind === null || !isValidAddressableRef(address)) return null
  return encodeTlvEntity("naddr", [
    { type: TLV_SPECIAL, value: encodeBytes(address.dTag) },
    ...relayEntries(relayUrls),
    { type: TLV_AUTHOR, value: brandBytes(address.pubkey) },
    { type: TLV_KIND, value: kind },
  ])
}

/**
 * Strip a leading `nostr:` URI prefix from `input` (case-insensitive), with the space, tab, line feed, carriage return,
 * NUL and vertical tab around the input and around what follows the prefix.
 */
export const stripNostrUriPrefix = (input: string): string =>
  trimSpaceAndNul(trimSpaceAndNul(input).replace(/^nostr:/i, ""))

export type { DecodedEntity, DecodedNaddr, DecodedNevent, DecodedNote, DecodedNprofile, DecodedNpub }

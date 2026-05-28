import { bech32 } from "@scure/base"
import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import type { EventId } from "../value-object/event-id.ts"
import { parseEventId } from "../value-object/event-id.ts"
import { formatHex, parseHex } from "../value-object/hex.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"
import { textDecoder, textEncoder } from "../value-object/text-codec.ts"

interface Bech32Decoded {
  readonly hrp: string
  readonly bytes: Uint8Array
}

const tryDecodeBech32 = (str: string): Bech32Decoded | null => {
  try {
    const { prefix, bytes } = bech32.decodeToBytes(str)
    return { hrp: prefix, bytes }
  } // deno-lint-ignore innis/no-catch-in-layer -- @scure/base#decodeToBytes throws on malformed input
  catch {
    return null
  }
}

const encodeBech32 = (hrp: string, bytes: Uint8Array): string => bech32.encode(hrp, bech32.toWords(bytes), false)

interface TlvEntry {
  readonly type: number
  readonly value: Uint8Array
}

const parseTlv = (bytes: Uint8Array): ReadonlyArray<TlvEntry> => {
  const entries: Array<TlvEntry> = []
  // The loop guard (`i + 1 < bytes.length`) proves both reads are in-range, but the type
  // checker can't see that under `noUncheckedIndexedAccess` — every indexed read is typed
  // `T | undefined`. The `?? 0` fallback is what the compiler requires; it is unreachable
  // at runtime because the guard has already ruled out the undefined case.
  let i = 0
  while (i + 1 < bytes.length) {
    const type = bytes[i] ?? 0
    const length = bytes[i + 1] ?? 0
    i += 2
    if (i + length > bytes.length) break
    entries.push({ type, value: bytes.subarray(i, i + length) })
    i += length
  }
  return entries
}

const decodeBytes = (bytes: Uint8Array): string => textDecoder.decode(bytes)

// All callers pass a 4-byte subarray (TLV entries of length 4 — see `tlvFindEntry(..., 3, 4)`),
// so the four reads are always defined. `?? 0` is what `noUncheckedIndexedAccess` requires;
// it is unreachable at runtime because the 4-byte invariant has already ruled out undefined.
const readBigEndian32 = (bytes: Uint8Array): number =>
  ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)

const tlvFindEntry = (
  entries: ReadonlyArray<TlvEntry>,
  type: number,
  length: number | null = null,
): TlvEntry | undefined => entries.find((e) => e.type === type && (length === null || e.value.length === length))

const tlvExtractRelays = (entries: ReadonlyArray<TlvEntry>): ReadonlyArray<string> =>
  entries.filter((e) => e.type === 1).map((e) => decodeBytes(e.value))

/** Decoded NIP-19 `npub1…` payload — carries the already-branded `PublicKey`. */
type DecodedNpub = { readonly type: "npub"; readonly pubkey: PublicKey }
/** Decoded NIP-19 `note1…` payload — carries the already-branded `EventId`. */
type DecodedNote = { readonly type: "note"; readonly eventId: EventId }
/** Decoded NIP-19 `nprofile1…` payload — pubkey plus optional relay hints (TLV type 1). */
type DecodedNprofile = { readonly type: "nprofile"; readonly pubkey: PublicKey; readonly relays: ReadonlyArray<string> }
/** Decoded NIP-19 `nevent1…` payload — event id plus optional relay hints, author pubkey, and kind. */
type DecodedNevent = {
  readonly type: "nevent"
  readonly eventId: EventId
  readonly relays: ReadonlyArray<string>
  readonly pubkey: PublicKey | null
  readonly kind: number | null
}
/** Decoded NIP-19 `naddr1…` payload — addressable-event coordinate (`kind` + `pubkey` + `dTag`) plus optional relay hints. */
type DecodedNaddr = {
  readonly type: "naddr"
  readonly dTag: string
  readonly relays: ReadonlyArray<string>
  readonly pubkey: PublicKey
  readonly kind: number
}

/** Discriminated union returned by `decodeNostrEntity` — branch on `.type` to access the entity-specific fields. */
type DecodedEntity = DecodedNpub | DecodedNote | DecodedNprofile | DecodedNevent | DecodedNaddr

/** Decode a NIP-19 bech32 entity (`npub`, `note`, `nprofile`, `nevent`, `naddr`); `nostr:` prefix is tolerated. */
export const decodeNostrEntity = (str: string): DecodedEntity | null => {
  const normalised = str.replace(/^nostr:/i, "").trim()
  const decoded = tryDecodeBech32(normalised.toLowerCase())
  if (!decoded) return null

  if (decoded.hrp === "npub" && decoded.bytes.length === 32) {
    return { type: "npub", pubkey: parsePublicKey(formatHex(decoded.bytes)) }
  }

  if (decoded.hrp === "note" && decoded.bytes.length === 32) {
    return { type: "note", eventId: parseEventId(formatHex(decoded.bytes)) }
  }

  const entries = parseTlv(decoded.bytes)

  if (decoded.hrp === "nprofile") {
    const pubkeyEntry = tlvFindEntry(entries, 0, 32)
    if (!pubkeyEntry) return null
    return {
      type: "nprofile",
      pubkey: parsePublicKey(formatHex(pubkeyEntry.value)),
      relays: tlvExtractRelays(entries),
    }
  }

  if (decoded.hrp === "nevent") {
    const eventIdEntry = tlvFindEntry(entries, 0, 32)
    if (!eventIdEntry) return null
    const pubkeyEntry = tlvFindEntry(entries, 2, 32)
    const kindEntry = tlvFindEntry(entries, 3, 4)
    const kind = kindEntry ? readBigEndian32(kindEntry.value) : null
    return {
      type: "nevent",
      eventId: parseEventId(formatHex(eventIdEntry.value)),
      relays: tlvExtractRelays(entries),
      pubkey: pubkeyEntry ? parsePublicKey(formatHex(pubkeyEntry.value)) : null,
      kind,
    }
  }

  if (decoded.hrp === "naddr") {
    const dTagEntry = tlvFindEntry(entries, 0)
    const pubkeyEntry = tlvFindEntry(entries, 2, 32)
    const kindEntry = tlvFindEntry(entries, 3, 4)
    if (!pubkeyEntry || !kindEntry) return null
    return {
      type: "naddr",
      dTag: dTagEntry ? decodeBytes(dTagEntry.value) : "",
      relays: tlvExtractRelays(entries),
      pubkey: parsePublicKey(formatHex(pubkeyEntry.value)),
      kind: readBigEndian32(kindEntry.value),
    }
  }

  return null
}

const buildTlv = (entries: ReadonlyArray<TlvEntry>): Uint8Array => {
  let totalLength = 0
  for (const { value } of entries) totalLength += 2 + value.length
  const out = new Uint8Array(totalLength)
  let i = 0
  for (const { type, value } of entries) {
    out[i++] = type
    out[i++] = value.length
    out.set(value, i)
    i += value.length
  }
  return out
}

const encodeBytes = (str: string): Uint8Array => textEncoder.encode(str)

// Relay-hint inputs to the NIP-19 encoders (`encodeNprofile` / `encodeNevent` / `encodeNaddr`)
// are typed `ReadonlyArray<string>` rather than `ReadonlyArray<RelayUrl>`. NIP-19 relay hints
// are advisory and have no canonical form on the wire — relays do exist that don't satisfy
// `parseRelayUrl`'s strict `wss?://` regex, and rejecting them at the encoder boundary would
// just push the workaround into callers. If brand validation matters at your boundary, pipe
// inputs through `parseRelayUrl` or `normaliseRelayUrl` *before* handing them to the encoder.
const tlvAddRelays = (entries: Array<TlvEntry>, relayUrls: ReadonlyArray<string>): void => {
  for (const url of relayUrls) entries.push({ type: 1, value: encodeBytes(url) })
}

const encodeTlvEntity = (hrp: string, entries: ReadonlyArray<TlvEntry>): string => encodeBech32(hrp, buildTlv(entries))

/** Encode a 32-byte hex public key as its NIP-19 `npub1...` string. */
export const encodePubkeyToNpub = (pubkey: PublicKey): string => encodeBech32("npub", parseHex(pubkey))

/** Encode a 32-byte hex event ID as its NIP-19 `note1...` string. */
export const encodeEventIdToNote = (eventId: EventId): string => encodeBech32("note", parseHex(eventId))

/** Encode an `nprofile1...` containing `pubkey` and optional relay hints (NIP-19 TLV type 1). */
export const encodeNprofile = (pubkey: PublicKey, relayUrls: ReadonlyArray<string> = []): string => {
  const entries: Array<TlvEntry> = [{ type: 0, value: parseHex(pubkey) }]
  tlvAddRelays(entries, relayUrls)
  return encodeTlvEntity("nprofile", entries)
}

const encodeBigEndian32 = (value: number): Uint8Array =>
  new Uint8Array([(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])

/** Options for `encodeNevent` — relay hints (TLV type 1), optional author pubkey (TLV type 2), and optional kind (TLV type 3). */
export interface EncodeNeventOptions {
  readonly relayUrls?: ReadonlyArray<string>
  readonly authorPubkey?: PublicKey | null
  readonly kind?: number | null
}

/** Encode an `nevent1...` containing `eventId` and optional relay hints / author pubkey / kind. */
export const encodeNevent = (eventId: EventId, options: EncodeNeventOptions = {}): string => {
  const entries: Array<TlvEntry> = [{ type: 0, value: parseHex(eventId) }]
  tlvAddRelays(entries, options.relayUrls ?? [])
  if (options.authorPubkey) entries.push({ type: 2, value: parseHex(options.authorPubkey) })
  if (options.kind !== undefined && options.kind !== null) {
    entries.push({ type: 3, value: encodeBigEndian32(options.kind) })
  }
  return encodeTlvEntity("nevent", entries)
}

/** Encode an `naddr1...` for an addressable event coordinate, with optional relay hints. */
export const encodeNaddr = (
  { dTag, pubkey, kind }: AddressableEventRef,
  relayUrls: ReadonlyArray<string> = [],
): string => {
  const entries: Array<TlvEntry> = [{ type: 0, value: encodeBytes(dTag) }]
  tlvAddRelays(entries, relayUrls)
  entries.push({ type: 2, value: parseHex(pubkey) })
  entries.push({ type: 3, value: encodeBigEndian32(kind) })
  return encodeTlvEntity("naddr", entries)
}

/**
 * Match NIP-19 entities (`npub1…`, `nprofile1…`, `note1…`, `nevent1…`, `naddr1…`)
 * inside free text, with or without a leading `nostr:` prefix. The captured group
 * (index 1) is the bare bech32 string ready to feed into {@link decodeNostrEntity}.
 *
 * Use this regex **only** with `String#matchAll` (or after explicitly resetting `lastIndex`).
 * The `g` flag is required for `matchAll` but makes `.test()`/`.exec()` *stateful*: the second
 * call would start from where the first left off and may silently skip matches. Don't reach
 * for `.test()` here; use `matchAll(...).next().done === false` or `String#match` instead.
 */
export const NOSTR_ENTITY_REGEX = /(?:nostr:|\b)((?:npub1|nprofile1|note1|nevent1|naddr1)(?:(?!nostr:)[a-z0-9])+)/gi

/** Trim whitespace and strip a leading `nostr:` URI prefix from `input` (case-insensitive). */
export const stripNostrUriPrefix = (input: string): string => input.trim().replace(/^nostr:/i, "").trim()

/**
 * Decode any NIP-19 entity that carries a pubkey (`npub1...`, `nprofile1...`, the optional
 * pubkey of an `nevent1...`, or the author pubkey of an `naddr1...`) into its `PublicKey`.
 * Returns `null` if the input is empty, unparseable, or a `note1...` (which carries an
 * event id, not a pubkey).
 *
 * Use this at any boundary where a user pastes a Nostr identifier and the rest of the
 * code expects a `PublicKey`. It's the general inverse of the per-entity encoders.
 */
export const pubkeyFromNip19 = (input: string | null): PublicKey | null => {
  if (!input) return null
  const decoded = decodeNostrEntity(input)
  if (!decoded || !("pubkey" in decoded) || !decoded.pubkey) return null
  return decoded.pubkey
}

export type { DecodedEntity, DecodedNaddr, DecodedNevent, DecodedNote, DecodedNprofile, DecodedNpub }

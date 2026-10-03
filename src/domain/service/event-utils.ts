import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import { isNonNegativeInteger, isRecord, isString } from "./guards.ts"
import type { NostrEvent, UnsignedEvent } from "../value-object/nostr-event.ts"
import { isValidTagsArray } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import { isValidSig } from "../value-object/sig.ts"
import { decodeNostrEntity, stripNostrUriPrefix } from "./bech32.ts"
import type { EventToSign } from "./event-id.ts"
import { isValidKind, kindCategory } from "../value-object/kinds.ts"

/**
 * What `parseNostrInput` resolved a pasted identifier to — an event, a profile or an address — with the relay hints its
 * NIP-19 entity carried.
 */
export type ParsedNostrInput =
  | { readonly type: "event"; readonly id: EventId; readonly relayHints: ReadonlyArray<RelayUrl> }
  | { readonly type: "profile"; readonly pubkey: PublicKey; readonly relayHints: ReadonlyArray<RelayUrl> }
  | { readonly type: "address"; readonly address: AddressableEventRef; readonly relayHints: ReadonlyArray<RelayUrl> }

/**
 * Read what a person typed or pasted — a NIP-19 `npub`, `nprofile`, `note`, `nevent` or `naddr`, bare or as a NIP-21
 * `nostr:` URI, with space around it — as the event, profile or address it names (ADR-0037). A bare 64-character hex
 * string names nothing on its own: it may be an event id or a public key, and only the caller knows which it expects.
 */
export const parseNostrInput = (input: string): ParsedNostrInput | null => {
  const decoded = decodeNostrEntity(stripNostrUriPrefix(input))
  if (decoded === null) return null
  switch (decoded.type) {
    case "npub":
      return { type: "profile", pubkey: decoded.pubkey, relayHints: [] }
    case "nprofile":
      return { type: "profile", pubkey: decoded.pubkey, relayHints: decoded.relays }
    case "note":
      return { type: "event", id: decoded.eventId, relayHints: [] }
    case "nevent":
      return { type: "event", id: decoded.eventId, relayHints: decoded.relays }
    case "naddr":
      return { type: "address", address: decoded.address, relayHints: decoded.relays }
  }
}

/**
 * The filter for the current event at an address. A plain replaceable event (kind 0, 3, 10002, …) carries no `d` tag,
 * so its filter leaves `d` out; every other kind keeps the `d` filter.
 */
export const buildAddressableEventFilter = ({ kind, pubkey, dTag }: AddressableEventRef): NostrFilter =>
  kindCategory(kind) === "replaceable"
    ? { kinds: [kind], authors: [pubkey] }
    : { kinds: [kind], authors: [pubkey], "#d": [dTag] }

/** Construct a `NostrFilter` that fetches the event identified by `parsed`; returns `null` for a profile. */
export const buildEventFilter = (parsed: ParsedNostrInput): NostrFilter | null => {
  if (parsed.type === "event") return { ids: [parsed.id] }
  if (parsed.type === "address") return { ...buildAddressableEventFilter(parsed.address), limit: 1 }
  return null
}

const UNSIGNED_EVENT_CHECKS = [
  ["kind", isValidKind],
  ["created_at", isNonNegativeInteger],
  ["tags", isValidTagsArray],
  ["content", isString],
] as const

const EVENT_TO_SIGN_CHECKS = [["pubkey", isValidPublicKey], ...UNSIGNED_EVENT_CHECKS] as const

const FIELD_CHECKS = [["id", isValidEventId], ...EVENT_TO_SIGN_CHECKS, ["sig", isValidSig]] as const

const isUnsignedEvent = (value: unknown): value is UnsignedEvent =>
  isRecord(value) && UNSIGNED_EVENT_CHECKS.every(([field, check]) => check(value[field]))

const isEventToSign = (value: unknown): value is EventToSign =>
  isRecord(value) && EVENT_TO_SIGN_CHECKS.every(([field, check]) => check(value[field]))

const isNostrEvent = (value: unknown): value is NostrEvent =>
  isRecord(value) && FIELD_CHECKS.every(([field, check]) => check(value[field]))

/**
 * Validate `value` as an unsigned event template (`kind`, `created_at`, `tags`, `content`); `null` if any field is
 * invalid. Extra fields are dropped.
 */
export const parseUnsignedEvent = (value: unknown): UnsignedEvent | null => {
  if (!isUnsignedEvent(value)) return null
  const { kind, created_at, tags, content } = value
  return { kind, created_at, tags, content }
}

/**
 * Validate `value` as an unsigned event with its author (`EventToSign`); `null` if any field is invalid. Extra fields
 * are dropped.
 */
export const parseEventToSign = (value: unknown): EventToSign | null => {
  if (!isEventToSign(value)) return null
  const { pubkey, kind, created_at, tags, content } = value
  return { pubkey, kind, created_at, tags, content }
}

/**
 * Validate `value` as a signed `NostrEvent` (shape only, no signature check); returns `null` if any field is invalid.
 * The result carries exactly the seven NIP-01 fields, so serialising it never re-emits a key the input smuggled in.
 */
export const parseNostrEvent = (value: unknown): NostrEvent | null => {
  if (!isNostrEvent(value)) return null
  const { id, pubkey, created_at, kind, tags, content, sig } = value
  return { id, pubkey, created_at, kind, tags, content, sig }
}

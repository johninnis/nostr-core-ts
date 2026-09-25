import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import { parseAddressableRef } from "../value-object/addressable-ref.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import type { EventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import type { Tag } from "../value-object/nostr-event.ts"
import { decodeNostrEntity } from "./bech32.ts"

const eventRef = (value: string): EventOrAddressRef | null =>
  isValidEventId(value) ? { type: "event", id: value } : null

// An address needs a non-empty `d`: `replyTargetRef` points at an addressable event with no `d` tag by its id.
const addressRef = (address: AddressableEventRef | null): EventOrAddressRef | null =>
  address && address.dTag ? { type: "address", address } : null

/**
 * Parse an {@link EventOrAddressRef} from any of the string forms it takes on the wire or in stored data: a
 * 64-char lowercase hex event id, a NIP-01 `kind:pubkey:d` coordinate, or a NIP-19 `note1…` / `nevent1…` /
 * `naddr1…` entity (`nostr:` prefix tolerated). Returns `null` for anything else, including an address with an
 * empty `d` tag.
 */
export const parseEventOrAddressRef = (value: string): EventOrAddressRef | null => {
  const decoded = decodeNostrEntity(value)
  if (decoded?.type === "note" || decoded?.type === "nevent") return { type: "event", id: decoded.eventId }
  if (decoded?.type === "naddr") return addressRef({ kind: decoded.kind, pubkey: decoded.pubkey, dTag: decoded.dTag })
  return eventRef(value) ?? addressRef(parseAddressableRef(value))
}

/**
 * The {@link EventOrAddressRef} a tag points at: the event id of an `e` / `E` tag, or the coordinate of an
 * `a` / `A` tag. Returns `null` for any other tag name or a malformed value.
 */
export const eventOrAddressRefFromTag = (tag: Tag): EventOrAddressRef | null => {
  const [name, value] = tag
  if (value === undefined) return null
  if (name === "e" || name === "E") return eventRef(value)
  if (name === "a" || name === "A") return addressRef(parseAddressableRef(value))
  return null
}

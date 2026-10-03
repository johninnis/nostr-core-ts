import { parseAddressableRef } from "../value-object/addressable-ref.ts"
import { isValidEventId, parseEventId } from "../value-object/event-id.ts"
import type { EventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import type { Tag } from "../value-object/nostr-event.ts"
import { decodeNostrEntity } from "./bech32.ts"

/**
 * Parse an {@link EventOrAddressRef} from any of the string forms it takes on the wire or in stored data, exactly as
 * written: a hex event id, a NIP-01 `kind:pubkey:d` coordinate, or a bare NIP-19 `note1…` / `nevent1…` / `naddr1…`
 * entity. A `nostr:` prefix or space around the value makes it `null` (ADR-0037), as does a profile entity.
 */
export const parseEventOrAddressRef = (value: string): EventOrAddressRef | null => {
  const id = parseEventId(value)
  if (id !== null) return { type: "event", id }
  const entity = decodeNostrEntity(value)
  if (entity?.type === "note" || entity?.type === "nevent") return { type: "event", id: entity.eventId }
  if (entity?.type === "naddr") return { type: "address", address: entity.address }
  if (entity !== null) return null
  const address = parseAddressableRef(value)
  return address === null ? null : { type: "address", address }
}

/**
 * The {@link EventOrAddressRef} a tag points at: the event id of an `e` / `E` tag, or the coordinate of an
 * `a` / `A` tag. Returns `null` for any other tag name or a malformed value.
 */
export const eventOrAddressRefFromTag = (tag: Tag): EventOrAddressRef | null => {
  const [name, value] = tag
  if (value === undefined) return null
  if (name === "e" || name === "E") return isValidEventId(value) ? { type: "event", id: value } : null
  if (name !== "a" && name !== "A") return null
  const address = parseAddressableRef(value)
  return address === null ? null : { type: "address", address }
}

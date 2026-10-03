import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import type { SubscriptionId } from "../value-object/subscription-id.ts"
import { canFilterMatch } from "./filter.ts"
import { serialiseEvent } from "./event-json.ts"

/**
 * Serialise the NIP-01 client messages a Nostr client sends to a relay over the WebSocket wire.
 *
 * Each function returns the exact JSON string to hand to `WebSocket.send`, so the wire format
 * lives in one place instead of being open-coded as `JSON.stringify([...])` at every call site.
 * The relay-bound message set is fixed by the protocol — `REQ`, `EVENT`, `CLOSE` (NIP-01) and
 * `AUTH` (NIP-42) — so these are named functions rather than a dispatcher over a message union:
 * every caller knows which message it is sending.
 *
 * @module
 */

const FIELD_ORDER = ["ids", "authors", "kinds", "#", "since", "until", "limit", "search"]

const fieldRank = (key: string): number => FIELD_ORDER.indexOf(key.startsWith("#") ? "#" : key)

// Deliberate: only innis/nostr-core's filter keys go out, in its order, so both cores send one byte form — see ADR-0029
const inWireOrder = (filter: NostrFilter): NostrFilter =>
  Object.fromEntries(
    Object.entries(filter)
      .filter(([key]) => fieldRank(key) !== -1)
      .sort(([a], [b]) => fieldRank(a) - fieldRank(b)),
  )

// Deliberate: a filter that can match nothing never reaches a relay, which may read it as match-all — see ADR-0029
/**
 * Serialise a NIP-01 `REQ` — open subscription `subId` with the OR-combined `filters` that can match something. A
 * filter that can match nothing (see `canFilterMatch`) is left out, and `null` is returned when none is left: such a
 * `REQ` selects nothing, so it is not sent.
 */
export const serialiseReqMessage = (subId: SubscriptionId, filters: ReadonlyArray<NostrFilter>): string | null => {
  const sendable = filters.filter(canFilterMatch)
  return sendable.length === 0 ? null : JSON.stringify(["REQ", subId, ...sendable.map(inWireOrder)])
}

/**
 * Serialise a NIP-01 `EVENT` — publish a signed event, its seven NIP-01 fields ({@link serialiseEvent}), to the
 * relay.
 */
export const serialiseEventMessage = (event: NostrEvent): string => `["EVENT",${serialiseEvent(event)}]`

/** Serialise a NIP-01 `CLOSE` — stop the subscription identified by `subId`. */
export const serialiseCloseMessage = (subId: SubscriptionId): string => JSON.stringify(["CLOSE", subId])

/**
 * Serialise a NIP-42 `AUTH` — answer a relay's authentication challenge with a signed kind-22242 event, its seven
 * NIP-01 fields ({@link serialiseEvent}).
 */
export const serialiseAuthMessage = (event: NostrEvent): string => `["AUTH",${serialiseEvent(event)}]`

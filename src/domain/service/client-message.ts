import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"

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

/** Serialise a NIP-01 `REQ` — open subscription `subId` with one or more OR-combined filters. */
export const serialiseReqMessage = (subId: string, filters: ReadonlyArray<NostrFilter>): string =>
  JSON.stringify(["REQ", subId, ...filters])

/** Serialise a NIP-01 `EVENT` — publish a signed event to the relay. */
export const serialiseEventMessage = (event: NostrEvent): string => JSON.stringify(["EVENT", event])

/** Serialise a NIP-01 `CLOSE` — stop the subscription identified by `subId`. */
export const serialiseCloseMessage = (subId: string): string => JSON.stringify(["CLOSE", subId])

/** Serialise a NIP-42 `AUTH` — answer a relay's authentication challenge with a signed kind-22242 event. */
export const serialiseAuthMessage = (event: NostrEvent): string => JSON.stringify(["AUTH", event])

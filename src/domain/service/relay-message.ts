import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import { isRecord } from "../value-object/guards.ts"
import { tryParseJson } from "../value-object/json.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import { parseNostrEvent } from "./event-utils.ts"

/**
 * A relay-to-client message parsed from the NIP-01 wire (plus NIP-42 `AUTH` and NIP-45 `COUNT`) —
 * the inverse of the `serialise*Message` family. `subscriptionId` is the client-chosen id the relay
 * echoes back; `message` defaults to `""` when the relay omits the reason on an `OK` / `CLOSED`.
 */
export type RelayMessage =
  | { readonly type: "EVENT"; readonly subscriptionId: string; readonly event: NostrEvent }
  | { readonly type: "EOSE"; readonly subscriptionId: string }
  | { readonly type: "OK"; readonly eventId: EventId; readonly accepted: boolean; readonly message: string }
  | { readonly type: "CLOSED"; readonly subscriptionId: string; readonly message: string }
  | { readonly type: "NOTICE"; readonly message: string }
  | { readonly type: "AUTH"; readonly challenge: string }
  | { readonly type: "COUNT"; readonly subscriptionId: string; readonly count: number }

const asString = (value: unknown): string | null => typeof value === "string" ? value : null

const orEmpty = (value: unknown): string => typeof value === "string" ? value : ""

/**
 * Parse a relay-to-client message string into a typed {@link RelayMessage}, or `null` if it is not a
 * well-formed message of a known type — invalid JSON, a non-array, an unknown verb, missing or
 * ill-typed fields, or an `EVENT` whose payload {@link parseNostrEvent} rejects.
 */
export const parseRelayMessage = (raw: string): RelayMessage | null => {
  const parsed = tryParseJson(raw)
  if (!Array.isArray(parsed)) return null
  const fields: readonly unknown[] = parsed
  const [verb, a, b, c] = fields

  switch (verb) {
    case "EVENT": {
      const subscriptionId = asString(a)
      const event = parseNostrEvent(b)
      return subscriptionId !== null && event !== null ? { type: "EVENT", subscriptionId, event } : null
    }
    case "EOSE": {
      const subscriptionId = asString(a)
      return subscriptionId !== null ? { type: "EOSE", subscriptionId } : null
    }
    case "OK": {
      if (!isValidEventId(a) || typeof b !== "boolean") return null
      return { type: "OK", eventId: a, accepted: b, message: orEmpty(c) }
    }
    case "CLOSED": {
      const subscriptionId = asString(a)
      return subscriptionId !== null ? { type: "CLOSED", subscriptionId, message: orEmpty(b) } : null
    }
    case "NOTICE": {
      const message = asString(a)
      return message !== null ? { type: "NOTICE", message } : null
    }
    case "AUTH": {
      const challenge = asString(a)
      return challenge !== null ? { type: "AUTH", challenge } : null
    }
    case "COUNT": {
      const subscriptionId = asString(a)
      if (subscriptionId === null || !isRecord(b) || typeof b.count !== "number") return null
      return { type: "COUNT", subscriptionId, count: b.count }
    }
    default:
      return null
  }
}

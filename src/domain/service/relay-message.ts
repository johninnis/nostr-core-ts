import type { AuthChallenge } from "../value-object/auth-challenge.ts"
import { parseAuthChallenge } from "../value-object/auth-challenge.ts"
import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import { isNonNegativeInteger, isRecord } from "./guards.ts"
import { parseJson } from "./json.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { SubscriptionId } from "../value-object/subscription-id.ts"
import { isValidSubscriptionId } from "../value-object/subscription-id.ts"
import { parseNostrEvent } from "./event-utils.ts"

const REASON_PREFIXES = [
  "duplicate",
  "pow",
  "blocked",
  "rate-limited",
  "invalid",
  "restricted",
  "mute",
  "error",
  "auth-required",
] as const

/** A machine-readable `OK` / `CLOSED` reason prefix: the NIP-01 set plus NIP-42's `auth-required`. */
export type ReasonPrefix = typeof REASON_PREFIXES[number]

const isReasonPrefix = (value: string): value is ReasonPrefix => REASON_PREFIXES.some((prefix) => prefix === value)

/**
 * The reason prefix at the head of an `OK` / `CLOSED` message (the word before the first `:`), or `null` when it names
 * none.
 */
export const parseReasonPrefix = (message: string): ReasonPrefix | null => {
  const separator = message.indexOf(":")
  const head = separator === -1 ? null : message.slice(0, separator)
  return head !== null && isReasonPrefix(head) ? head : null
}

const rejectionReason = (message: string): ReasonPrefix => parseReasonPrefix(message) ?? "error"

/**
 * A relay-to-client message parsed from the NIP-01 wire (plus NIP-42 `AUTH` and NIP-45 `COUNT`) — the inverse of the
 * `serialise*Message` family. `subscriptionId` is the client-chosen id the relay echoes back; `reason` is the
 * machine-readable prefix of an `OK` / `CLOSED` message. NIP-01 requires every refusal (an `OK` false or a `CLOSED`) to
 * carry a prefix and names `error` "for when none of that fits", so a refusal whose message states no standardised
 * prefix is an `error`; only an accepting `OK` can have no reason (`null`).
 */
export type RelayMessage =
  | { readonly type: "EVENT"; readonly subscriptionId: SubscriptionId; readonly event: NostrEvent }
  | { readonly type: "EOSE"; readonly subscriptionId: SubscriptionId }
  | {
    readonly type: "OK"
    readonly eventId: EventId
    readonly accepted: true
    readonly message: string
    readonly reason: ReasonPrefix | null
  }
  | {
    readonly type: "OK"
    readonly eventId: EventId
    readonly accepted: false
    readonly message: string
    readonly reason: ReasonPrefix
  }
  | {
    readonly type: "CLOSED"
    readonly subscriptionId: SubscriptionId
    readonly message: string
    readonly reason: ReasonPrefix
  }
  | { readonly type: "NOTICE"; readonly message: string }
  | { readonly type: "AUTH"; readonly challenge: AuthChallenge }
  | {
    readonly type: "COUNT"
    readonly subscriptionId: SubscriptionId
    readonly count: number
    readonly approximate: boolean
  }

const parseCount = (subscriptionId: unknown, payload: unknown): RelayMessage | null => {
  if (!isValidSubscriptionId(subscriptionId) || !isRecord(payload)) return null
  const { count } = payload
  const approximate = payload.approximate ?? false
  if (!isNonNegativeInteger(count) || typeof approximate !== "boolean") return null
  return { type: "COUNT", subscriptionId, count, approximate }
}

/**
 * Parse a relay-to-client message string into a typed {@link RelayMessage}, or `null` if it is not a well-formed
 * message of a known type — invalid JSON, a non-array, an unknown verb, a subscription id that is empty or over 64
 * characters, an `OK` / `CLOSED` without its message, an empty `NOTICE` message (shared ADR-0099), an empty `AUTH`
 * challenge, a `COUNT` that is not a non-negative integer, or an `EVENT` whose payload {@link parseNostrEvent}
 * rejects. A message needs the elements its type defines; elements after them, such as an `EOSE` hint, are ignored
 * (shared ADR-0091).
 */
export const parseRelayMessage = (raw: string): RelayMessage | null => {
  const parsed = parseJson(raw)
  if (!parsed.success || !Array.isArray(parsed.value)) return null
  const fields: readonly unknown[] = parsed.value
  const [verb, a, b, c] = fields

  switch (verb) {
    case "EVENT": {
      const event = parseNostrEvent(b)
      return isValidSubscriptionId(a) && event !== null ? { type: "EVENT", subscriptionId: a, event } : null
    }
    case "EOSE":
      return isValidSubscriptionId(a) ? { type: "EOSE", subscriptionId: a } : null
    case "OK": {
      if (!isValidEventId(a) || typeof b !== "boolean" || typeof c !== "string") return null
      return b
        ? { type: "OK", eventId: a, accepted: true, message: c, reason: parseReasonPrefix(c) }
        : { type: "OK", eventId: a, accepted: false, message: c, reason: rejectionReason(c) }
    }
    case "CLOSED": {
      if (!isValidSubscriptionId(a) || typeof b !== "string") return null
      return { type: "CLOSED", subscriptionId: a, message: b, reason: rejectionReason(b) }
    }
    case "NOTICE":
      return typeof a === "string" && a !== "" ? { type: "NOTICE", message: a } : null
    case "AUTH": {
      const challenge = parseAuthChallenge(a)
      return challenge !== null ? { type: "AUTH", challenge } : null
    }
    case "COUNT":
      return parseCount(a, b)
    default:
      return null
  }
}

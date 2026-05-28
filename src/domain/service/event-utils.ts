import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import { isNumber, isRecord, isString } from "../value-object/guards.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import { isValidTagsArray } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import { isValidSig } from "../value-object/sig.ts"
import { decodeNostrEntity, stripNostrUriPrefix } from "./bech32.ts"

export interface ParsedNostrInput {
  readonly eventId?: EventId
  readonly pubkey?: PublicKey
  readonly naddr?: { readonly kind: number; readonly pubkey: PublicKey; readonly dTag: string }
  readonly relayHints: ReadonlyArray<string>
}

/** Parse a hex event ID, npub/nprofile/note/nevent/naddr, or `nostr:` URI into its constituent fields and relay hints. */
export const parseNostrInput = (input: string): ParsedNostrInput | null => {
  // `isValidEventId` is a type predicate (`(raw): raw is EventId`), so a successful check
  // narrows `normalised` to `EventId` directly — no second `parseEventId` call needed.
  const normalised = stripNostrUriPrefix(input).toLowerCase()
  if (isValidEventId(normalised)) return { eventId: normalised, relayHints: [] }

  const decoded = decodeNostrEntity(normalised)
  if (!decoded) return null

  if (decoded.type === "npub") return { pubkey: decoded.pubkey, relayHints: [] }
  if (decoded.type === "nprofile") return { pubkey: decoded.pubkey, relayHints: decoded.relays }
  if (decoded.type === "note") return { eventId: decoded.eventId, relayHints: [] }
  if (decoded.type === "nevent") return { eventId: decoded.eventId, relayHints: decoded.relays }
  if (decoded.type === "naddr") {
    return {
      naddr: { kind: decoded.kind, pubkey: decoded.pubkey, dTag: decoded.dTag },
      relayHints: decoded.relays,
    }
  }

  return null
}

/** Construct a `NostrFilter` that fetches the event identified by `parsed`; returns `null` for pubkey-only inputs. */
export const buildEventFilter = (parsed: ParsedNostrInput): NostrFilter | null => {
  if (parsed.eventId) return { ids: [parsed.eventId] }
  if (parsed.naddr) {
    const { kind, pubkey, dTag } = parsed.naddr
    return { kinds: [kind], authors: [pubkey], "#d": [dTag], limit: 1 }
  }
  return null
}

/**
 * Single source of truth for the per-field shape check applied to a candidate `NostrEvent`.
 * Both `parseNostrEvent` and `validateEventStructure` iterate this tuple; adding or changing a
 * field is a one-line edit and stays consistent across both APIs.
 *
 * Declared as an `as const` tuple so the field names narrow to a literal-union type without
 * an explicit cast (which the project's `no-type-assertions` lint rule would reject).
 */
const FIELD_CHECKS = [
  ["id", isValidEventId],
  ["pubkey", isValidPublicKey],
  ["kind", isNumber],
  ["created_at", isNumber],
  ["tags", isValidTagsArray],
  ["content", isString],
  ["sig", isValidSig],
] as const

export type EventStructureField = typeof FIELD_CHECKS[number][0]

export interface EventStructureCheck {
  readonly field: EventStructureField
  readonly passed: boolean
  readonly rawValue: unknown
}

// File-private TS type-predicate. Exists solely to narrow the return of `parseNostrEvent` to
// `NostrEvent` without an `as` assertion — the project bans those at every system boundary.
const isNostrEvent = (value: unknown): value is NostrEvent => {
  if (!isRecord(value)) return false
  for (const [field, check] of FIELD_CHECKS) {
    if (!check(value[field])) return false
  }
  return true
}

/** Validate `value` as a signed `NostrEvent` (shape only, no signature check); returns `null` if any field is invalid. */
export const parseNostrEvent = (value: unknown): NostrEvent | null => isNostrEvent(value) ? value : null

/** Report per-field pass/failure status when validating that `event` has the shape of a signed `NostrEvent`. */
export const validateEventStructure = (event: Record<string, unknown>): ReadonlyArray<EventStructureCheck> =>
  FIELD_CHECKS.map(([field, check]) => ({
    field,
    passed: check(event[field]),
    rawValue: event[field],
  }))

import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import { formatAddressableRef, parseAddressableRef } from "../value-object/addressable-ref.ts"
import { KIND_EPHEMERAL_GIFT_WRAP, KIND_EVENT_DELETION, KIND_GIFT_WRAP } from "../value-object/kinds.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { replyTargetRef } from "./event-analysis.ts"
import { extractEventIds, extractPubkeys, extractTagValues } from "./tags.ts"

const GIFT_WRAP_KINDS: ReadonlySet<number> = new Set([KIND_GIFT_WRAP, KIND_EPHEMERAL_GIFT_WRAP])

const isDeletionRequest = (event: NostrEvent): boolean => event.kind === KIND_EVENT_DELETION

// Deliberate: a gift wrap is also deleted by a key it is addressed to, not only by its one-time signer — see shared ADR-0124
const keysThatDelete = (target: NostrEvent): ReadonlyArray<PublicKey> =>
  GIFT_WRAP_KINDS.has(target.kind) ? [...new Set([target.pubkey, ...extractPubkeys(target.tags)])] : [target.pubkey]

const coordinateOf = (target: NostrEvent): string | null => {
  const ref = replyTargetRef(target)
  return ref.type === "address" ? formatAddressableRef(ref.address) : null
}

/**
 * The coordinates a NIP-09 deletion request deletes: each `a` tag naming a valid coordinate of the request's own
 * author, replaceable coordinates (`kind:pubkey:`) included, each once, in the order first tagged. An `a` tag naming
 * another author's coordinate, or no coordinate, is ignored, and an event that is not a deletion request deletes none.
 * A coordinate deletes only the versions created at or before the request (shared ADR-0124): read it with the
 * request's `created_at`, as {@link deletionCovers} does.
 */
export const deletedCoordinates = (deletion: NostrEvent): ReadonlyArray<AddressableEventRef> =>
  isDeletionRequest(deletion)
    ? extractTagValues(deletion.tags, "a").flatMap((value) => {
      const ref = parseAddressableRef(value)
      return ref !== null && ref.pubkey === deletion.pubkey ? [ref] : []
    })
    : []

const namesById = (deletion: NostrEvent, target: NostrEvent): boolean =>
  extractEventIds(deletion.tags).includes(target.id) && keysThatDelete(target).includes(deletion.pubkey)

// Deliberate: a coordinate deletes only the versions no later than the request, so a later version restores it — see shared ADR-0124
const namesByCoordinate = (deletion: NostrEvent, target: NostrEvent): boolean => {
  const coordinate = coordinateOf(target)
  return coordinate !== null && target.created_at <= deletion.created_at &&
    deletedCoordinates(deletion).some((ref) => formatAddressableRef(ref) === coordinate)
}

/**
 * Whether `deletion` deletes `target` under NIP-09 and shared ADR-0124: `deletion` is a kind 5 request, `target` is not
 * (a request against a request has no effect, shared ADR-0093), and either an `e` tag names `target` and `target` is the
 * request's author's own event or a gift wrap, kind 1059 or 21059, one of whose `p` tags names that author; or an `a`
 * tag names `target`'s coordinate, the author's own, and `target` was created at or before the request. The judgement
 * is the same whichever of the two arrived first (shared ADR-0126), so a party holding requests checks every event that
 * arrives against them. It reads both events as given: verify their signatures first. Hiding, marking or removing what
 * it covers is the caller's choice.
 */
export const deletionCovers = (deletion: NostrEvent, target: NostrEvent): boolean =>
  isDeletionRequest(deletion) && !isDeletionRequest(target) &&
  (namesById(deletion, target) || namesByCoordinate(deletion, target))

/**
 * The filters that find, among stored events, every deletion request that could delete `target`: a kind 5 by a key
 * that can delete it (its author, and for a gift wrap each key it is addressed to) naming its id in an `e` tag, and,
 * for a replaceable or addressable version, a kind 5 by its author naming its coordinate in an `a` tag created at or
 * after it. They select candidates for a store to fetch; {@link deletionCovers} stays the one decision on each request
 * found. Empty for a deletion request, which nothing deletes.
 */
export const buildDeletionLookupFilters = (target: NostrEvent): ReadonlyArray<NostrFilter> => {
  if (isDeletionRequest(target)) return []
  const byId: NostrFilter = { kinds: [KIND_EVENT_DELETION], authors: keysThatDelete(target), "#e": [target.id] }
  const coordinate = coordinateOf(target)
  return coordinate === null ? [byId] : [byId, {
    kinds: [KIND_EVENT_DELETION],
    authors: [target.pubkey],
    "#a": [coordinate],
    since: target.created_at,
  }]
}

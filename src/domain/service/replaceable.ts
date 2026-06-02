import type { Tag } from "../value-object/nostr-event.ts"
import type { EventId } from "../value-object/event-id.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isParameterisedReplaceable, isReplaceable } from "./kinds.ts"
import { getTagValue } from "./tags.ts"

/**
 * Build a cache/storage key for a replaceable event: `pubkey:kind` (NIP-01 replaceable) or
 * `pubkey:kind:d` (parameterised); `null` for non-replaceable kinds. **This is NOT the
 * `a`-tag wire format** — for that, use `formatAddressableRef` (`kind:pubkey:d`).
 */
export const replaceableStorageKey = (
  event: { readonly pubkey: PublicKey; readonly kind: number; readonly tags: ReadonlyArray<Tag> },
): string | null => {
  const { kind, pubkey, tags } = event
  if (isParameterisedReplaceable(kind)) return `${pubkey}:${kind}:${getTagValue(tags, "d") ?? ""}`
  if (isReplaceable(kind)) return `${pubkey}:${kind}`
  return null
}

/**
 * NIP-01 replaceable precedence: `candidate` supersedes `existing` when it is newer, or — on an
 * exact `created_at` tie — when its id is lexicographically lower. This is the deterministic
 * tie-break every relay and cache must share so they converge on the same surviving event for a
 * given `replaceableStorageKey`.
 */
export const replaceableSupersedes = (
  candidate: { readonly id: EventId; readonly created_at: number },
  existing: { readonly id: EventId; readonly created_at: number },
): boolean =>
  candidate.created_at > existing.created_at ||
  (candidate.created_at === existing.created_at && candidate.id < existing.id)

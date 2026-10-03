import type { Tag } from "../value-object/nostr-event.ts"
import type { EventId } from "../value-object/event-id.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { kindCategory } from "../value-object/kinds.ts"
import { soleTagValue } from "./tags.ts"

// Deliberate: disagreeing d tags name no identifier, never the first one — see shared ADR-0014
/**
 * An event's `d` tag value, the empty string that identifies an event without one (NIP-01), or `null` when its `d` tags
 * disagree: such an event names no one identifier (shared ADR-0014).
 */
export const getDTag = (tags: ReadonlyArray<Tag>): string | null => {
  const dTag = soleTagValue(tags, "d")
  return dTag.state === "absent" ? "" : dTag.value
}

/**
 * Build a cache/storage key for a replaceable event: `pubkey:kind` (NIP-01 replaceable) or `pubkey:kind:d`
 * (addressable); `null` for non-replaceable kinds and for an addressable event whose `d` tags disagree, which has no
 * one key. **This is NOT the `a`-tag wire format** — for that, use `formatAddressableRef` (`kind:pubkey:d`).
 */
export const replaceableStorageKey = (
  event: { readonly pubkey: PublicKey; readonly kind: number; readonly tags: ReadonlyArray<Tag> },
): string | null => {
  const { kind, pubkey, tags } = event
  const category = kindCategory(kind)
  if (category === "addressable") {
    const dTag = getDTag(tags)
    return dTag === null ? null : `${pubkey}:${kind}:${dTag}`
  }
  if (category === "replaceable") return `${pubkey}:${kind}`
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

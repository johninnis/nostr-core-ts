import type { Tag } from "../value-object/nostr-event.ts"
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

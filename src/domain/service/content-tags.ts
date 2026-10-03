import { formatAddressableRef } from "../value-object/addressable-ref.ts"
import { kindCategory } from "../value-object/kinds.ts"
import type { Tag } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import type { DecodedEntity } from "./bech32.ts"
import { extractContentReferences } from "./content-reference.ts"
import { extractHashtags } from "./hashtag.ts"
import { hasTag, removeTag } from "./tags.ts"

type ReferenceTag = readonly [string, string, ...Array<string>]

const quoteTag = (
  target: string,
  relays: ReadonlyArray<RelayUrl>,
  regularEventPubkey: PublicKey | null,
): ReferenceTag => {
  const relay = relays[0] ?? ""
  if (regularEventPubkey !== null) return ["q", target, relay, regularEventPubkey]
  return relay === "" ? ["q", target] : ["q", target, relay]
}

const isRegularOrUnstated = (kind: number | null): boolean => kind === null || kindCategory(kind) === "regular"

const referenceTags = (entity: DecodedEntity): ReadonlyArray<ReferenceTag> => {
  switch (entity.type) {
    case "npub":
    case "nprofile":
      return [["p", entity.pubkey]]
    case "note":
      return [["q", entity.eventId]]
    case "nevent": {
      const quotedAuthor = entity.pubkey !== null && isRegularOrUnstated(entity.kind) ? entity.pubkey : null
      const quote = quoteTag(entity.eventId, entity.relays, quotedAuthor)
      return entity.pubkey === null ? [quote] : [["p", entity.pubkey], quote]
    }
    case "naddr":
      return [["p", entity.address.pubkey], quoteTag(formatAddressableRef(entity.address), entity.relays, null)]
  }
}

const keepingEarlierHints = (earlier: ReferenceTag, later: ReferenceTag): ReferenceTag => {
  const hints = Array.from({ length: Math.max(earlier.length, later.length) - 2 }, (_, index) => {
    const kept = earlier[index + 2] ?? ""
    return kept !== "" ? kept : later[index + 2] ?? ""
  })
  return [later[0], later[1], ...hints]
}

const withMention = (tags: ReadonlyArray<ReferenceTag>, mention: ReferenceTag): ReadonlyArray<ReferenceTag> => {
  const earlier = tags.find(([name, value]) => name === mention[0] && value === mention[1])
  return [
    ...removeTag(tags, mention[0], mention[1]),
    earlier === undefined ? mention : keepingEarlierHints(earlier, mention),
  ]
}

// Deliberate: a repeated content tag moves to its last mention, keeping its first hints — see shared ADR-0076
/**
 * `threadTags` followed by what `content` mentions, in content order: for each nostr: reference its author's `p` tag,
 * then its NIP-18 `q` tag, then a `t` tag per hashtag. A target the content names more than once has one tag, written
 * where it is last named, holding in each slot after its value the first non-empty relay or author any mention gave;
 * a content tag with the name and first value of a thread tag is left out, so the thread tag is kept.
 */
export const withContentTags = (threadTags: ReadonlyArray<Tag>, content: string): ReadonlyArray<Tag> => [
  ...threadTags,
  ...[
    ...extractContentReferences(content).flatMap(({ entity }) => referenceTags(entity)),
    ...extractHashtags(content).map((hashtag): ReferenceTag => ["t", hashtag]),
  ].reduce(withMention, []).filter((tag) => !hasTag(threadTags, tag[0], tag[1])),
]

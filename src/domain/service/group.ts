import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { KIND_CHAT_MESSAGE, KIND_GROUP_METADATA } from "../value-object/kinds.ts"
import { getDTag } from "./replaceable.ts"
import { hasTagNamed, soleTagValue } from "./tags.ts"

/**
 * A NIP-29 relay-based group, derived from a kind 39000 metadata event. A group is owned by the relay that hosts it, so
 * `relay` records where the metadata was read from; with `id` it addresses the group as `relay'id`. Admins, members,
 * roles and the lifecycle kinds are out of scope (ADR-0040).
 */
export interface Group {
  readonly id: string
  readonly relay: RelayUrl
  readonly name: string
  readonly about: string | null
  readonly picture: string | null
  readonly isPublic: boolean
  readonly isOpen: boolean
  readonly isRestricted: boolean
  readonly isHidden: boolean
  readonly isLiveAvSpace: boolean
}

/** Filter for NIP-29 group metadata — every group on a relay, or the one group `groupId` names when it is given. */
export const groupMetadataFilter = (groupId?: string): NostrFilter =>
  groupId === undefined ? { kinds: [KIND_GROUP_METADATA] } : { kinds: [KIND_GROUP_METADATA], "#d": [groupId] }

/** Filter matching every chat message (kind 9) posted to a group, identified by its `h` tag. */
export const groupChatFilter = (groupId: string): NostrFilter => ({ kinds: [KIND_CHAT_MESSAGE], "#h": [groupId] })

/**
 * Derive a {@link Group} from a kind 39000 event read from `relay`, or `null` for another kind or a `d` tag (the group
 * id NIP-29 requires) that is absent, empty or disagreeing. A `name`, `about` or `picture` is read exactly as written,
 * an empty one as the empty string, and is absent only when no tag states it or its tags disagree, the `name` then
 * being the id (shared ADR-0014, shared ADR-0079): whether to show a blank value is the caller's decision. Each flag
 * follows its NIP-29 marker tag: `isPublic` unless `private`, `isOpen` unless `closed`, and `isRestricted`, `isHidden`
 * and `isLiveAvSpace` when `restricted`, `hidden` and `livekit` are present.
 *
 * NIP-29 has the relay sign its group metadata with the key its NIP-11 document names as `self`. Pass that key as
 * `relayPubkey` and an event signed by any other key is `null`. NIP-11 makes `self` optional, so a caller whose relay
 * publishes none omits it, and the signer is then not checked.
 */
export const parseGroupMetadata = (event: NostrEvent, relay: RelayUrl, relayPubkey?: PublicKey): Group | null => {
  if (event.kind !== KIND_GROUP_METADATA) return null
  if (relayPubkey !== undefined && event.pubkey !== relayPubkey) return null
  const id = getDTag(event.tags)
  if (id === null || id === "") return null
  return {
    id,
    relay,
    name: soleTagValue(event.tags, "name").value ?? id,
    about: soleTagValue(event.tags, "about").value,
    picture: soleTagValue(event.tags, "picture").value,
    isPublic: !hasTagNamed(event.tags, "private"),
    isOpen: !hasTagNamed(event.tags, "closed"),
    isRestricted: hasTagNamed(event.tags, "restricted"),
    isHidden: hasTagNamed(event.tags, "hidden"),
    isLiveAvSpace: hasTagNamed(event.tags, "livekit"),
  }
}

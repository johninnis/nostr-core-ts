import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import type { Tag } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { parseRelayUrl } from "../value-object/relay-url.ts"
import type { SoleTagValue } from "../value-object/sole-tag-value.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"

/**
 * NIP-65 relay-marker value — `"read"`, `"write"`, or `"both"`, which an `r` tag with no marker, or with a marker
 * NIP-65 does not define, states (shared ADR-0108).
 */
type RelayMarker = "read" | "write" | "both"

/** Normalised entry returned by `extractRelayEntries` — a branded `RelayUrl` and its declared marker. */
interface RelayEntry {
  readonly url: RelayUrl
  readonly marker: RelayMarker
}

const toRelayMarker = (value: string | undefined): RelayMarker => value === "read" || value === "write" ? value : "both"

/** `true` when `tags` contains any tag whose first element is `name` and second element is `value`. */
export const hasTag = (tags: ReadonlyArray<Tag>, name: string, value: string): boolean =>
  tags.some((t) => t[0] === name && t[1] === value)

/** Append `[name, value]` if no matching tag is present; returns the original array otherwise (no duplication). */
export const addTag = (tags: ReadonlyArray<Tag>, name: string, value: string): ReadonlyArray<Tag> =>
  hasTag(tags, name, value) ? tags : [...tags, [name, value]]

/** Drop every tag whose first element is `name` and second element is `value`. */
export const removeTag = <T extends Tag>(tags: ReadonlyArray<T>, name: string, value: string): ReadonlyArray<T> =>
  tags.filter((t) => !(t[0] === name && t[1] === value))

/**
 * The distinct second elements of tags whose first element matches `tagName`, in the order first tagged. A tag repeated
 * with the same value is one claim (shared ADR-0014), and an empty value is the empty string, not absence (shared
 * ADR-0079): a reader that wants only non-empty values, or values of some form, filters for them itself.
 */
export const extractTagValues = (tags: ReadonlyArray<Tag>, tagName: string): ReadonlyArray<string> => [
  ...new Set(tags.flatMap((t) => t[0] === tagName && t[1] !== undefined ? [t[1]] : [])),
]

/**
 * What the `tagName` tags state as their one value: `one` with the value, the empty string included; `absent` when no
 * tag carries one; `disagreeing` when they carry different values, `value` being `null` for both. A value repeated
 * across tags is one claim and tags that disagree state no value, so tag order never decides the answer (shared
 * ADR-0014).
 */
export const soleTagValue = (tags: ReadonlyArray<Tag>, tagName: string): SoleTagValue =>
  soleValue(tags.flatMap((t) => t[0] === tagName && t[1] !== undefined ? [t[1]] : []))

/** Every valid `PublicKey` the `p` tags of `tags` name, once each, in the order first tagged. */
export const extractPubkeys = (tags: ReadonlyArray<Tag>): ReadonlyArray<PublicKey> =>
  extractTagValues(tags, "p").filter(isValidPublicKey)

/** Extract `(url, marker)` entries from `r` tags, normalising URLs and defaulting unknown markers to `"both"`. */
export const extractRelayEntries = (tags: ReadonlyArray<Tag>): ReadonlyArray<RelayEntry> =>
  tags.flatMap((t) => {
    const url = t[0] === "r" ? parseRelayUrl(t[1]) : null
    return url === null ? [] : [{ url, marker: toRelayMarker(t[2]) }]
  })

/** Every valid `EventId` the `e` tags of `tags` name, once each, in the order first tagged. */
export const extractEventIds = (tags: ReadonlyArray<Tag>): ReadonlyArray<EventId> =>
  extractTagValues(tags, "e").filter(isValidEventId)

const NIP10_MARKERS: ReadonlySet<string> = new Set(["root", "reply", "mention"])

/**
 * The marker of a kind 1 `e` tag: NIP-10's `root` or `reply`, or the `mention` marker earlier versions of NIP-10
 * defined, which marks the tag without naming a root or a parent (shared ADR-0012); `null` when it carries none of
 * them.
 */
export const nip10Marker = (tag: Tag): string | null => {
  const marker = tag[3]
  return marker !== undefined && NIP10_MARKERS.has(marker) ? marker : null
}

/**
 * The author an `e` tag names: its fifth element when it has one, the NIP-10 slot after the marker (`["e", id, relay,
 * marker, pubkey]`, the marker possibly empty), its fourth never then read as an author; otherwise its fourth, where
 * NIP-22 and NIP-25 write it (`["e", id, relay, pubkey]`); `null` when that element is not a public key (shared
 * ADR-0012).
 */
export const eventTagAuthor = (tag: Tag): PublicKey | null => {
  const author = tag.length > 4 ? tag[4] : tag[3]
  return author !== undefined && isValidPublicKey(author) ? author : null
}

/**
 * Entry returned by `extractEventRefs` — a branded `EventId`, the relay hint from the third tag column, parsed as a
 * canonical `RelayUrl`, or `null` when the column is absent, empty, or not a relay URL, and the author the tag names
 * (see {@link eventTagAuthor}).
 */
interface EventRef {
  readonly id: EventId
  readonly relayHint: RelayUrl | null
  readonly author: PublicKey | null
}

/**
 * Extract `(id, relayHint, author)` entries from `e` tags whose first value parses as a valid event ID; an invalid hint
 * is no hint, and an invalid author no author.
 */
export const extractEventRefs = (tags: ReadonlyArray<Tag>): ReadonlyArray<EventRef> =>
  tags.flatMap((t) =>
    t[0] === "e" && t[1] !== undefined && isValidEventId(t[1])
      ? [{ id: t[1], relayHint: parseRelayUrl(t[2]), author: eventTagAuthor(t) }]
      : []
  )

const isRelayTagFor = (tag: Tag, url: RelayUrl): boolean =>
  tag[0] === "r" && tag[1] !== undefined && parseRelayUrl(tag[1]) === url

/** `true` when `tags` contains an `r` tag for `url` in any form that canonicalises to it (regardless of marker). */
export const hasRelayEntry = (tags: ReadonlyArray<Tag>, url: RelayUrl): boolean =>
  tags.some((t) => isRelayTagFor(t, url))

const relayMarkerFor = (read: boolean, write: boolean): RelayMarker | null =>
  read && write ? "both" : read ? "read" : write ? "write" : null

/**
 * The relay marker `tags` state for `url` (compared by canonical form) across every `r` tag for it, so tag order never
 * decides it: a relay one tag marks `read` and another `write` is used both ways (shared ADR-0108). `null` when no tag
 * names the relay.
 */
export const getRelayEntryMarker = (tags: ReadonlyArray<Tag>, url: RelayUrl): RelayMarker | null => {
  const markers = tags.flatMap((t) => isRelayTagFor(t, url) ? [toRelayMarker(t[2])] : [])
  return relayMarkerFor(markers.some((m) => m !== "write"), markers.some((m) => m !== "read"))
}

const relayTag = (url: RelayUrl, marker: RelayMarker): Tag => marker === "both" ? ["r", url] : ["r", url, marker]

const isSameTag = (a: Tag, b: Tag): boolean => a.length === b.length && a.every((value, index) => value === b[index])

// Deliberate: an add* verb that upserts, because relay tags are unique by URL — see ADR-0009
/**
 * Upsert the `r` tag for `url` with `marker`: appended when absent, otherwise written in canonical form at the first
 * equivalent tag's position with every other equivalent dropped, so the result holds exactly one `r` tag for `url`.
 */
export const addRelayTag = (
  tags: ReadonlyArray<Tag>,
  url: RelayUrl,
  marker: RelayMarker = "both",
): ReadonlyArray<Tag> => {
  const tag = relayTag(url, marker)
  const first = tags.findIndex((t) => isRelayTagFor(t, url))
  if (first === -1) return [...tags, tag]
  return tags.flatMap((t, index) => index === first ? [tag] : isRelayTagFor(t, url) ? [] : [t])
}

/** Remove every `r` tag for `url`, compared by canonical form. */
export const removeRelayTag = (tags: ReadonlyArray<Tag>, url: RelayUrl): ReadonlyArray<Tag> =>
  tags.filter((t) => !isRelayTagFor(t, url))

/**
 * A change to how a NIP-65 relay is used: `true` enables that direction, `false` disables it, absent leaves it as is.
 */
interface RelayUsageChange {
  readonly read?: boolean | undefined
  readonly write?: boolean | undefined
}

/**
 * Apply `change` to `url`'s NIP-65 marker, read across every `r` tag for it: enabling read on a write relay makes it
 * both, disabling read on a both relay leaves it write, and disabling a relay's last direction removes its `r` tags.
 * Otherwise the relay is written as one canonical `r` tag, as `addRelayTag` writes it (ADR-0009). Returns `tags` itself
 * when nothing changes, so callers can tell a no-op by identity.
 */
export const setRelayEntryUsage = (
  tags: ReadonlyArray<Tag>,
  url: RelayUrl,
  change: RelayUsageChange,
): ReadonlyArray<Tag> => {
  const marker = getRelayEntryMarker(tags, url)
  const next = relayMarkerFor(
    change.read ?? (marker === "read" || marker === "both"),
    change.write ?? (marker === "write" || marker === "both"),
  )
  if (next === null) return marker === null ? tags : removeRelayTag(tags, url)
  const current = tags.filter((t) => isRelayTagFor(t, url))
  const only = current.length === 1 ? current[0] : undefined
  return only !== undefined && isSameTag(only, relayTag(url, next)) ? tags : addRelayTag(tags, url, next)
}

export type { EventRef, RelayEntry, RelayMarker, RelayUsageChange }

import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import { tryParseJson } from "../value-object/json.ts"
import type { Tag } from "../value-object/nostr-event.ts"
import { isValidTag } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { normaliseRelayUrl } from "../value-object/relay-url.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import { PrivateEntriesParseError } from "../exception/private-entries-parse-error.ts"
import type { SignerError } from "../exception/signer-error.ts"

type DecryptFn = (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>

export type PrivateEntriesError = SignerError | PrivateEntriesParseError

type RelayMarker = "read" | "write" | "both"

interface RelayEntry {
  readonly url: RelayUrl
  readonly marker: RelayMarker
}

interface FullList {
  readonly publicTags: ReadonlyArray<Tag>
  readonly privateTags: ReadonlyArray<Tag>
}

const toRelayMarker = (value: string | undefined): RelayMarker => value === "read" || value === "write" ? value : "both"

/** `true` when `tags` contains any tag whose first element is `name` and second element is `value`. */
export const hasTag = (tags: ReadonlyArray<Tag>, name: string, value: string): boolean =>
  tags.some((t) => t[0] === name && t[1] === value)

/** Append `[name, value]` if no matching tag is present; returns the original array otherwise (no duplication). */
export const addTag = (tags: ReadonlyArray<Tag>, name: string, value: string): ReadonlyArray<Tag> =>
  hasTag(tags, name, value) ? tags : [...tags, [name, value]]

/** Drop every tag whose first element is `name` and second element is `value`. */
export const removeTag = (tags: ReadonlyArray<Tag>, name: string, value: string): ReadonlyArray<Tag> =>
  tags.filter((t) => !(t[0] === name && t[1] === value))

/** Collect every non-empty second element of tags whose first element matches `tagName`. */
export const extractTagValues = (tags: ReadonlyArray<Tag>, tagName: string): ReadonlyArray<string> =>
  tags.flatMap((t) => t[0] === tagName && t[1] ? [t[1]] : [])

/** Return the second element of the first tag matching `tagName`, or `null` if absent / the tag carries no value. */
export const getTagValue = (tags: ReadonlyArray<Tag>, tagName: string): string | null => {
  const tag = tags.find((t) => t[0] === tagName)
  return tag?.[1] ?? null
}

/** Extract every valid `PublicKey` from the `p` tags of `tags`. */
export const extractPubkeys = (tags: ReadonlyArray<Tag>): ReadonlyArray<PublicKey> =>
  extractTagValues(tags, "p").filter(isValidPublicKey)

/** Extract `(url, marker)` entries from `r` tags, normalising URLs and defaulting unknown markers to `"both"`. */
export const extractRelayEntries = (tags: ReadonlyArray<Tag>): ReadonlyArray<RelayEntry> => {
  const entries: Array<RelayEntry> = []
  for (const t of tags) {
    if (t[0] !== "r" || !t[1]) continue
    const url = normaliseRelayUrl(t[1])
    if (!url) continue
    entries.push({ url, marker: toRelayMarker(t[2]) })
  }
  return entries
}

/** `true` when `tags` contains a `p` tag referencing `pubkey`. */
export const hasPubkey = (tags: ReadonlyArray<Tag>, pubkey: PublicKey): boolean => hasTag(tags, "p", pubkey)

/** Append a `p` tag for `pubkey` if not already present; returns the original array otherwise. */
export const addPubkeyTag = (tags: ReadonlyArray<Tag>, pubkey: PublicKey): ReadonlyArray<Tag> =>
  addTag(tags, "p", pubkey)

/** Remove any `p` tag referencing `pubkey`. */
export const removePubkeyTag = (tags: ReadonlyArray<Tag>, pubkey: PublicKey): ReadonlyArray<Tag> =>
  removeTag(tags, "p", pubkey)

/** Extract every valid `EventId` from the `e` tags of `tags`. */
export const extractEventIds = (tags: ReadonlyArray<Tag>): ReadonlyArray<EventId> =>
  extractTagValues(tags, "e").filter(isValidEventId)

interface EventRef {
  readonly id: EventId
  readonly relayHint?: string
}

/** Extract `(id, relayHint?)` entries from `e` tags whose first value parses as a valid event ID. */
export const extractEventRefs = (tags: ReadonlyArray<Tag>): ReadonlyArray<EventRef> => {
  const refs: Array<EventRef> = []
  for (const t of tags) {
    if (t[0] !== "e" || typeof t[1] !== "string") continue
    if (!isValidEventId(t[1])) continue
    const relayHint = t[2]
    refs.push(relayHint !== undefined && relayHint !== "" ? { id: t[1], relayHint } : { id: t[1] })
  }
  return refs
}

/** `true` when `tags` contains an `e` tag referencing `eventId`. */
export const hasEventId = (tags: ReadonlyArray<Tag>, eventId: EventId): boolean => hasTag(tags, "e", eventId)

/** Append an `e` tag for `eventId` if not already present. */
export const addEventTag = (tags: ReadonlyArray<Tag>, eventId: EventId): ReadonlyArray<Tag> =>
  addTag(tags, "e", eventId)

/** Remove any `e` tag referencing `eventId`. */
export const removeEventTag = (tags: ReadonlyArray<Tag>, eventId: EventId): ReadonlyArray<Tag> =>
  removeTag(tags, "e", eventId)

/** `true` when `tags` contains an `r` tag for `url` (regardless of marker). */
export const hasRelayEntry = (tags: ReadonlyArray<Tag>, url: string): boolean => hasTag(tags, "r", url)

/** Return the relay marker on the first `r` tag for `url`, or `null` if no such tag exists. */
export const getRelayEntryMarker = (tags: ReadonlyArray<Tag>, url: string): RelayMarker | null => {
  const tag = tags.find((t) => t[0] === "r" && t[1] === url)
  return tag ? toRelayMarker(tag[2]) : null
}

/**
 * Add an `r` tag for `url` with the given `marker`. **Intentionally an upsert** — kept under the
 * `add*` verb on purpose, for two reasons:
 *
 *   1. **Consistency with the rest of the `add*Tag` family.** Callers reach for the same verb
 *      regardless of which tag type they're touching; the API surface stays one shape.
 *   2. **It does what its name says — add this tag.** When there's no existing `r` tag for `url`,
 *      it appends, exactly like `addTag` / `addEventTag` / `addPubkeyTag`. When there *is* one
 *      already, we treat the new call as the latest expression of caller intent and overwrite
 *      the marker (most-recent-wins). Relay tags are unique by URL — there is no sensible state
 *      where two `r` tags for the same URL coexist with different markers; the caller asking
 *      for `addRelayTag(tags, url, "read")` after a prior `addRelayTag(tags, url, "write")` is
 *      stating their current preference, not their original one.
 *
 * If you need to distinguish "did I just insert?" from "did I just overwrite?", call
 * `hasRelayEntry` first. The other `add*Tag` helpers in this module are no-op-on-duplicate
 * because their tags carry no extra state — `[name, value]` equality is total — so there is
 * nothing for a second call to "update". Relay tags carry a marker; this one isn't.
 */
export const addRelayTag = (
  tags: ReadonlyArray<Tag>,
  url: string,
  marker: RelayMarker = "both",
): ReadonlyArray<Tag> => {
  const tag: Tag = marker === "both" ? ["r", url] : ["r", url, marker]
  return hasRelayEntry(tags, url) ? tags.map((t) => t[0] === "r" && t[1] === url ? tag : t) : [...tags, tag]
}

/** Remove any `r` tag for `url`. */
export const removeRelayTag = (tags: ReadonlyArray<Tag>, url: string): ReadonlyArray<Tag> => removeTag(tags, "r", url)

/** Decrypt an event's `content` and parse it as a JSON array of private tags (NIP-51 encrypted lists). */
export const decryptPrivateEntries = async (
  encryptedContent: string,
  pubkey: PublicKey,
  decryptFn: DecryptFn,
): Promise<Result<ReadonlyArray<Tag>, PrivateEntriesError>> => {
  if (!encryptedContent) return ok([])
  const result = await decryptFn(pubkey, encryptedContent)
  if (!result.success) return result
  const parsed = tryParseJson(result.value)
  if (parsed === null) {
    return failure(new PrivateEntriesParseError("private entries could not be parsed as JSON"))
  }
  if (!Array.isArray(parsed)) {
    return failure(new PrivateEntriesParseError("private entries are not a JSON array"))
  }
  return ok(parsed.filter(isValidTag))
}

/** Combine `event.tags` (public) with the decrypted private tags from `event.content` into a `FullList`. */
export const extractFullList = async (
  event: { readonly content: string; readonly pubkey: PublicKey; readonly tags: ReadonlyArray<Tag> },
  decryptFn: DecryptFn | null,
): Promise<Result<FullList, PrivateEntriesError>> => {
  const publicTags = event.tags
  if (!decryptFn || !event.content) return ok({ publicTags, privateTags: [] })
  const result = await decryptPrivateEntries(event.content, event.pubkey, decryptFn)
  if (!result.success) return result
  return ok({ publicTags, privateTags: result.value })
}

export type { DecryptFn, EventRef, FullList, RelayEntry, RelayMarker }

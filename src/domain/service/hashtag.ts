import type { NostrEvent } from "../value-object/nostr-event.ts"

/**
 * Matches a hashtag in event content: a `#` followed by one or more ASCII word characters, not
 * preceded by another word character (so `foo#bar` is not a hashtag) or by `&` (so the `#` of an
 * HTML entity such as `&#39;` is not mistaken for one). Capture group 1 is the bare tag, without
 * the leading `#` and in the author's original casing.
 *
 * Global — intended for `String.prototype.matchAll` and `String.prototype.replace`, both of which
 * consume the whole string and leave `lastIndex` at 0. Feed the capture through
 * {@link normaliseHashtag} before using it as a `t` tag value or a `#t` filter term.
 */
export const HASHTAG_PATTERN: RegExp = /(?<![&\w])#([a-zA-Z0-9_]+)/gu

/**
 * The canonical `t` tag value for a hashtag: no leading `#`, lower-cased. NIP-24 specifies `t` tag
 * values as lower-case, and both relay-side `#t` filtering and {@link compileFilter} match tag
 * values exactly — so a hashtag must pass through here on its way into a `t` tag or a `#t` filter,
 * or a `#Bitcoin` written in content will never match the `bitcoin` tag stored alongside it.
 */
export const normaliseHashtag = (raw: string): string => raw.replace(/^#/, "").toLowerCase()

/**
 * Every distinct hashtag in `content`, normalised via {@link normaliseHashtag} and de-duplicated,
 * in first-appearance order. This is the single definition of "which hashtags does this content
 * carry" — `buildTextNote` uses it to emit `t` tags, so any consumer deriving hashtags from content
 * for display or querying must use it (or {@link HASHTAG_PATTERN}) rather than its own regex.
 */
export const extractHashtags = (content: string): ReadonlyArray<string> => {
  const tags = new Set<string>()
  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    const tag = match[1]
    if (tag) tags.add(normaliseHashtag(tag))
  }
  return [...tags]
}

/**
 * Whether `event` carries `hashtag` — as an explicit `t` tag, or by writing it in the content
 * without tagging it. A `#t` filter only sees the former, because a relay can match tags and
 * nothing else; this is the wider local answer, for deciding whether an event already in hand
 * belongs to a hashtag feed. Casing is irrelevant on both sides.
 */
export const eventHasHashtag = (event: NostrEvent, hashtag: string): boolean => {
  const target = normaliseHashtag(hashtag)
  if (!target) return false
  for (const tag of event.tags) {
    const value = tag[1]
    if (tag[0] === "t" && value !== undefined && normaliseHashtag(value) === target) return true
  }
  // Scanned rather than compared against `extractHashtags`, which would allocate a Set and an array
  // per call — this runs against every event a hashtag feed sees.
  for (const match of event.content.matchAll(HASHTAG_PATTERN)) {
    const found = match[1]
    if (found !== undefined && normaliseHashtag(found) === target) return true
  }
  return false
}

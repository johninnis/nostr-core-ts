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

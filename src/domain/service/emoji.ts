import type { Tag } from "../value-object/nostr-event.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"

const SHORTCODE_REGEX = /^[a-zA-Z0-9_-]+$/

/**
 * Matches a NIP-30 `:shortcode:` in content; capture group 1 is the bare shortcode. A new global pattern on every call,
 * for `String.prototype.matchAll`, `String.prototype.replace` or `exec`, so no caller shares another's `lastIndex`.
 */
export const emojiShortcodePattern = (): RegExp => /:([a-zA-Z0-9_-]+):/g

/**
 * An event's NIP-30 custom emoji: each `emoji` tag's shortcode mapped to its image URL. Tags without a URL or with a
 * shortcode outside `[a-zA-Z0-9_-]` are skipped. A shortcode repeated with one URL is one claim, and a shortcode whose
 * tags name different URLs maps to none, whatever their order (shared ADR-0014). The URL is the author's, unchecked:
 * sanitise it before rendering.
 */
export const parseEmojiTags = (tags: ReadonlyArray<Tag>): ReadonlyMap<string, string> => {
  const named = tags.flatMap(([name, shortcode, url]) =>
    name === "emoji" && shortcode && url && SHORTCODE_REGEX.test(shortcode) ? [{ shortcode, url }] : []
  )
  return new Map(
    [...Map.groupBy(named, ({ shortcode }) => shortcode)].flatMap(([shortcode, claims]) => {
      const url = soleValue(claims.map((claim) => claim.url)).value
      return url === null ? [] : [[shortcode, url] as const]
    }),
  )
}

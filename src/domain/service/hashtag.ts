import type { NostrEvent } from "../value-object/nostr-event.ts"
import { extractTagValues } from "./tags.ts"

const NON_WHITESPACE_RUN = /[^\p{Z}\t-\r\u0085]+/gu

const HASHTAG = /(?<![&\p{L}\p{M}\p{N}_])#([\p{L}\p{M}\p{N}_]+)/gu

const URL_SCHEME_SEPARATOR = "://"

/** A hashtag found in text: where its `#` stands, the hashtag as written (`#` included), and the bare tag. */
interface HashtagMention {
  readonly index: number
  readonly text: string
  readonly tag: string
}

const beforeUrl = (run: string): string => {
  const url = run.indexOf(URL_SCHEME_SEPARATOR)
  return url === -1 ? run : run.slice(0, url)
}

const mentionsIn = (run: RegExpExecArray): ReadonlyArray<HashtagMention> =>
  [...beforeUrl(run[0]).matchAll(HASHTAG)].map((match) => ({
    index: run.index + match.index,
    text: match[0],
    tag: match[1] ?? "",
  }))

// Deliberate: read run by run, not by one pattern with a lookbehind that rescans a run per `#` — see shared ADR-0071
/**
 * Every hashtag in `content`, in order (shared ADR-0071): a `#` followed by one or more letters, combining marks,
 * digits or underscores of any script, not preceded by another such character (so `foo#bar` is not a hashtag) or by
 * `&` (so the `#` of an HTML entity such as `&#39;` is not mistaken for one), and not part of a URL: no `#` after a
 * `://` in the same run of non-whitespace characters (Unicode White_Space) is a hashtag, so `https://x.com/#frag`
 * carries none. Each `tag` is the author's original casing; feed it through {@link normaliseHashtag} before using it as
 * a `t` tag value or a `#t` filter term.
 */
export const findHashtags = (content: string): ReadonlyArray<HashtagMention> =>
  [...content.matchAll(NON_WHITESPACE_RUN)].flatMap(mentionsIn)

/**
 * The canonical `t` tag value for a hashtag: lower-cased (NIP-24: "the value MUST be a lowercase string"), or `null`
 * for the empty string, which names no hashtag. It does not trim or strip a leading `#` — that belongs to the input
 * edge that accepts typed text. Relay-side `#t` filtering and {@link compileFilter} match tag values exactly, so a
 * hashtag must pass through here on its way into a `t` tag or a `#t` filter, or a `#Bitcoin` written in content will
 * never match the `bitcoin` tag stored alongside it.
 */
export const normaliseHashtag = (raw: string): string | null => raw === "" ? null : raw.toLowerCase()

/**
 * Every distinct hashtag in `content`, normalised via {@link normaliseHashtag} and de-duplicated,
 * in first-appearance order. This is the single definition of "which hashtags does this content
 * carry" — `buildTextNote` uses it to emit `t` tags, so any consumer deriving hashtags from content
 * for display or querying must use it (or {@link findHashtags}) rather than its own regex.
 */
export const extractHashtags = (content: string): ReadonlyArray<string> => [
  ...new Set(findHashtags(content).flatMap((hashtag) => normaliseHashtag(hashtag.tag) ?? [])),
]

/**
 * Whether `event` carries `hashtag` — as an explicit `t` tag, or by writing it in the content without tagging it. A
 * `#t` filter only sees the former, because a relay can match tags and nothing else; this is the wider local answer,
 * for deciding whether an event already in hand belongs to a hashtag feed. Casing is irrelevant on both sides;
 * `hashtag` is the bare tag, without a leading `#`.
 */
export const eventHasHashtag = (event: NostrEvent, hashtag: string): boolean => {
  const target = normaliseHashtag(hashtag)
  if (target === null) return false
  return extractTagValues(event.tags, "t").some((value) => normaliseHashtag(value) === target) ||
    extractHashtags(event.content).includes(target)
}

export type { HashtagMention }

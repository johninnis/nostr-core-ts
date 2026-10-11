import type { DecodedEntity } from "./bech32.ts"
import { decodeNostrEntity } from "./bech32.ts"

/** A NIP-19 entity written in event content (NIP-27), bare or as a `nostr:` URI, and what it decodes to. */
export interface ContentReference {
  /** The text as written, including any `nostr:` prefix. */
  readonly match: string
  /** The bare bech32 entity, without the `nostr:` prefix. */
  readonly identifier: string
  /** Where `match` starts in the content, in UTF-16 code units, so it slices the content directly (shared ADR-0107). */
  readonly index: number
  readonly entity: DecodedEntity
}

// Deliberate: an entity runs to the first non-alphanumeric and decodes whole, never cut short — see shared ADR-0107
const ENTITY_PATTERN = /(?:nostr:|(?<![a-z0-9]))((?:npub1|nprofile1|note1|nevent1|naddr1)(?:(?!nostr:)[a-z0-9])+)/

// Deliberate: a URL runs to the first Unicode White_Space, spelled out since PHP's \s differs — see shared ADR-0107
const WEB_URL_PATTERN = /https?:\/\/[^\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*/gi

type Span = readonly [start: number, end: number]

const webUrlSpans = (content: string): ReadonlyArray<Span> =>
  [...content.matchAll(WEB_URL_PATTERN)].map((url): Span => [url.index, url.index + url[0].length])

// Deliberate: a bare entity in a web URL is part of the link, a nostr: URI never is — see shared ADR-0107
const isBareInsideAWebUrl = (found: RegExpExecArray, webUrls: ReadonlyArray<Span>): boolean =>
  found[0] === found[1] && webUrls.some(([start, end]) => found.index >= start && found.index < end)

const toReference = (found: RegExpExecArray): ContentReference | null => {
  const identifier = found[1]
  const entity = identifier === undefined ? null : decodeNostrEntity(identifier)
  return identifier === undefined || entity === null
    ? null
    : { match: found[0], identifier, index: found.index, entity }
}

/**
 * Every NIP-19 entity in `content` that decodes, in content order, repeats included. An entity runs over ASCII letters
 * and digits up to the first other character or a following `nostr:`, and is decoded whole, so one followed directly by
 * further letters or digits is no reference (shared ADR-0107). A bare entity counts only when no ASCII letter or digit
 * comes right before it, and only outside a web URL, a run from `http://` or `https://` to the first Unicode
 * whitespace; a `nostr:` URI counts wherever it stands. Tag building, rendering and prefetching all walk content
 * through here.
 */
export const extractContentReferences = (content: string): ReadonlyArray<ContentReference> => {
  const webUrls = webUrlSpans(content)
  return [...content.matchAll(new RegExp(ENTITY_PATTERN, "gi"))].flatMap((found) =>
    isBareInsideAWebUrl(found, webUrls) ? [] : toReference(found) ?? []
  )
}

/**
 * The entity written at the very start of `content`, or `null` when `content` does not open with one that decodes. The
 * anchored counterpart of {@link extractContentReferences}, for tokenisers that consume content from the front.
 */
export const leadingContentReference = (content: string): ContentReference | null => {
  const found = new RegExp(ENTITY_PATTERN, "iy").exec(content)
  return found === null ? null : toReference(found)
}

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

const toReference = (found: RegExpMatchArray): ContentReference | null => {
  const identifier = found[1]
  const entity = identifier === undefined ? null : decodeNostrEntity(identifier)
  return identifier === undefined || entity === null
    ? null
    : { match: found[0], identifier, index: found.index ?? 0, entity }
}

/**
 * Every NIP-19 entity in `content` that decodes, in content order, repeats included. An entity runs over ASCII letters
 * and digits up to the first other character or a following `nostr:`, and is decoded whole, so one followed directly by
 * further letters or digits is no reference (shared ADR-0107). A bare entity counts only when no ASCII letter or digit
 * comes right before it. Tag building, rendering and prefetching all walk content through here.
 */
export const extractContentReferences = (content: string): ReadonlyArray<ContentReference> =>
  [...content.matchAll(new RegExp(ENTITY_PATTERN, "gi"))].flatMap((found) => toReference(found) ?? [])

/**
 * The entity written at the very start of `content`, or `null` when `content` does not open with one that decodes. The
 * anchored counterpart of {@link extractContentReferences}, for tokenisers that consume content from the front.
 */
export const leadingContentReference = (content: string): ContentReference | null => {
  const found = new RegExp(ENTITY_PATTERN, "iy").exec(content)
  return found === null ? null : toReference(found)
}

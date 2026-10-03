import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import type { NostrEvent, Tag } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { trimSpaceAndNul } from "../value-object/trim.ts"

/**
 * A NIP-01 filter pre-compiled into Set-based lookups, so each `matches` call costs O(event tags)
 * instead of O(filter array lengths). Build one per long-lived filter (a subscription, an open REQ,
 * a cache scan) via {@link compileFilter} / {@link compileFilters} and reuse it across events.
 */
export interface CompiledFilter {
  /** `true` when `event` satisfies the compiled filter. */
  readonly matches: (event: NostrEvent) => boolean
}

interface TagConstraint {
  readonly name: string
  readonly values: ReadonlySet<string>
}

const hasTagValue = (tags: ReadonlyArray<Tag>, name: string, values: ReadonlySet<string>): boolean =>
  tags.some((tag) => tag[0] === name && tag[1] !== undefined && values.has(tag[1]))

const TAG_FILTER_KEY = /^#[a-zA-Z]$/

const MATCHES_NOTHING: CompiledFilter = Object.freeze({ matches: (): boolean => false })

const tagConstraintsOf = (filter: NostrFilter): ReadonlyArray<TagConstraint> | null => {
  const constraints: Array<TagConstraint> = []
  for (const [key, raw] of Object.entries(filter)) {
    if (raw === null) {
      throw new InvalidArgumentError(`A NostrFilter field is absent or typed, never null, and ${key} is null`)
    }
    if (!key.startsWith("#") || raw === undefined) continue
    if (!TAG_FILTER_KEY.test(key) || !Array.isArray(raw)) return null
    constraints.push({ name: key.slice(1), values: new Set<string>(raw) })
  }
  return constraints
}

const canMatch = (filter: NostrFilter, constraints: ReadonlyArray<TagConstraint>): boolean =>
  [filter.ids, filter.authors, filter.kinds].every((list) => list === undefined || list.length > 0) &&
  constraints.every((constraint) => constraint.values.size > 0) &&
  (filter.since === undefined || filter.until === undefined || filter.since <= filter.until)

/**
 * `true` when some event could satisfy `filter`: every list it carries holds a value, every `#` key is a NIP-01 tag
 * condition, and its `since` is not after its `until`. The filters {@link compileFilter} matches nothing for. A field
 * forced past the `NostrFilter` type as `null` throws `InvalidArgumentError`: NIP-01 types every field as a list, an
 * integer or a string, so `null` is a caller's fault, never "no condition" (shared ADR-0069).
 */
export const canFilterMatch = (filter: NostrFilter): boolean => {
  const constraints = tagConstraintsOf(filter)
  return constraints !== null && canMatch(filter, constraints)
}

const SEARCH_TERM_SEPARATOR = /[\t\n\v\f\r ]+/
const SEARCH_EXTENSION = /^[a-z][a-z0-9_-]*:[^:/]+$/i

// Deliberate: a key:value extension is ignored, as NIP-50 asks of what a matcher does not support — see shared ADR-0082
const searchTermsOf = (search: string): ReadonlyArray<string> =>
  trimSpaceAndNul(search).toLowerCase().split(SEARCH_TERM_SEPARATOR)
    .filter((term) => term !== "" && !SEARCH_EXTENSION.test(term))

// Deliberate: a search matches content holding every term, PHP nostr-core's reading of NIP-50 — see shared ADR-0082
const holdsEveryTerm = (content: string, terms: ReadonlyArray<string>): boolean => {
  const lowered = content.toLowerCase()
  return terms.every((term) => lowered.includes(term))
}

// Deliberate: an empty list or a # key NIP-01 does not define matches nothing, never everything — see ADR-0029
/**
 * Compile `filter` into a reusable predicate with NIP-01 filter semantics. Tag conditions are the `#` keys of one
 * letter, `a`–`z` or `A`–`Z`. A filter that can match nothing matches nothing: one whose `ids`, `authors`, `kinds` or
 * tag list is empty (NIP-01 lists hold "one or more values"), one carrying a `#` key that is not a NIP-01 tag
 * condition, or one whose `since` is after its `until`. A NIP-50 `search` matches an event whose content, lower-cased,
 * holds every term of the lower-cased search, each anywhere: the search is stripped of NUL and ASCII whitespace at its
 * ends, as PHP's `trim` strips them, and split on ASCII whitespace (space, tab, line feed, vertical tab, form feed and
 * carriage return). A piece that is NIP-50's `key:value` extension, two words separated by a colon (a key that starts
 * with a letter and holds only letters, digits, `_` and `-`, a colon, and a non-empty value with no `:` or `/`), is
 * ignored, as NIP-50 asks of extensions a matcher does not support, so a search of only whitespace and extensions holds
 * no term and matches every event. NIP-50 leaves the reading to each relay, and this is the one both nostr-core
 * libraries apply locally. `limit` is ignored: it bounds a subscription's result count, not what one event matches. A
 * field forced past the `NostrFilter` type as `null` throws `InvalidArgumentError`, as {@link canFilterMatch} does.
 */
export const compileFilter = (filter: NostrFilter): CompiledFilter => {
  const tagConstraints = tagConstraintsOf(filter)
  if (tagConstraints === null || !canMatch(filter, tagConstraints)) return MATCHES_NOTHING
  const ids = filter.ids ? new Set<string>(filter.ids) : null
  const authors = filter.authors ? new Set<string>(filter.authors) : null
  const kinds = filter.kinds ? new Set<number>(filter.kinds) : null
  const { since, until } = filter
  const searchTerms = filter.search === undefined ? null : searchTermsOf(filter.search)

  const matches = (event: NostrEvent): boolean => {
    if (ids && !ids.has(event.id)) return false
    if (authors && !authors.has(event.pubkey)) return false
    if (kinds && !kinds.has(event.kind)) return false
    if (since !== undefined && event.created_at < since) return false
    if (until !== undefined && event.created_at > until) return false
    return tagConstraints.every((constraint) => hasTagValue(event.tags, constraint.name, constraint.values)) &&
      (searchTerms === null || holdsEveryTerm(event.content, searchTerms))
  }

  return Object.freeze({ matches })
}

/**
 * Compile several filters into one predicate with `REQ` semantics: it matches when at least one
 * filter matches (filters OR together). An empty array matches nothing.
 */
export const compileFilters = (filters: ReadonlyArray<NostrFilter>): CompiledFilter => {
  const compiled = filters.map(compileFilter)
  return Object.freeze({
    matches: (event: NostrEvent): boolean => compiled.some((c) => c.matches(event)),
  })
}

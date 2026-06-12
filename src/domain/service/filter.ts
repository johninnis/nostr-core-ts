import type { NostrEvent, Tag } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"

/**
 * A NIP-01 filter pre-compiled into Set-based lookups, so each `matches` call costs O(event tags)
 * instead of O(filter array lengths). Build one per long-lived filter (a subscription, an open REQ,
 * a cache scan) via {@link compileFilter} / {@link compileFilters} and reuse it across events —
 * `matchesFilter` recompiles on every call and is only for one-shot checks.
 */
export interface CompiledFilter {
  /** `true` when `event` satisfies the compiled filter — same semantics as {@link matchesFilter}. */
  readonly matches: (event: NostrEvent) => boolean
}

interface TagConstraint {
  readonly name: string
  readonly values: ReadonlySet<string>
}

const hasTagValue = (tags: ReadonlyArray<Tag>, name: string, values: ReadonlySet<string>): boolean => {
  for (const tag of tags) {
    if (tag[0] === name && tag[1] && values.has(tag[1])) return true
  }
  return false
}

/**
 * Compile `filter` into a reusable predicate (NIP-01 filter semantics, including `#<letter>` tag
 * filters). `limit` and `search` are **not** per-event predicates and are ignored: `limit` bounds
 * the result count (a subscription concern, not a property of any single event), and `search`
 * (NIP-50) is relay-defined full-text matching that can't be reproduced client-side. A filter
 * carrying `search` therefore matches on its other constraints alone — don't rely on the compiled
 * predicate to enforce a search term.
 */
export const compileFilter = (filter: NostrFilter): CompiledFilter => {
  const ids = filter.ids ? new Set<string>(filter.ids) : null
  const authors = filter.authors ? new Set<string>(filter.authors) : null
  const kinds = filter.kinds ? new Set<number>(filter.kinds) : null
  const { since, until } = filter
  const tagConstraints: Array<TagConstraint> = []
  for (const [key, raw] of Object.entries(filter)) {
    if (!key.startsWith("#") || key.length < 2) continue
    if (!Array.isArray(raw) || raw.length === 0) continue
    tagConstraints.push({ name: key.slice(1), values: new Set<string>(raw) })
  }

  const matches = (event: NostrEvent): boolean => {
    if (ids && !ids.has(event.id)) return false
    if (authors && !authors.has(event.pubkey)) return false
    if (kinds && !kinds.has(event.kind)) return false
    if (since !== undefined && event.created_at < since) return false
    if (until !== undefined && event.created_at > until) return false
    for (const constraint of tagConstraints) {
      if (!hasTagValue(event.tags, constraint.name, constraint.values)) return false
    }
    return true
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

/**
 * One-shot {@link compileFilter}: `true` when `event` satisfies every constraint in `filter`.
 * Recompiles the filter on every call — for repeated matching against the same filter (dispatch
 * loops, cache scans), compile once and reuse the {@link CompiledFilter} instead.
 */
export const matchesFilter = (event: NostrEvent, filter: NostrFilter): boolean => compileFilter(filter).matches(event)

/** One-shot {@link compileFilters}: `true` when `event` matches at least one filter in `filters`. */
export const matchesAnyFilter = (event: NostrEvent, filters: ReadonlyArray<NostrFilter>): boolean =>
  compileFilters(filters).matches(event)

import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { extractTagValues } from "./tags.ts"

/**
 * `true` when `event` satisfies every constraint in `filter` (NIP-01 filter semantics, including
 * `#<letter>` tag filters). `limit` and `search` are **not** per-event predicates and are ignored:
 * `limit` bounds the result count (a subscription concern, not a property of any single event), and
 * `search` (NIP-50) is relay-defined full-text matching that can't be reproduced client-side. A
 * filter carrying `search` therefore matches here on its other constraints alone — don't rely on
 * `matchesFilter` to enforce a search term.
 */
export const matchesFilter = (event: NostrEvent, filter: NostrFilter): boolean => {
  if (filter.ids && !filter.ids.includes(event.id)) return false
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false
  if (filter.since !== undefined && event.created_at < filter.since) return false
  if (filter.until !== undefined && event.created_at > filter.until) return false

  for (const [key, raw] of Object.entries(filter)) {
    if (!key.startsWith("#") || key.length < 2) continue
    if (!Array.isArray(raw) || raw.length === 0) continue
    const eventTagValues = extractTagValues(event.tags, key.slice(1))
    if (!raw.some((v) => eventTagValues.includes(v))) return false
  }

  return true
}

/** `true` when `event` matches at least one filter in `filters` (REQ semantics: filters OR together). */
export const matchesAnyFilter = (event: NostrEvent, filters: ReadonlyArray<NostrFilter>): boolean =>
  filters.some((f) => matchesFilter(event, f))

import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { isRecord } from "../value-object/guards.ts"

const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonicalise)
      .map((element) => ({ element, key: JSON.stringify(element) }))
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      .map(({ element }) => element)
  }
  if (isRecord(value)) {
    const canonical: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) canonical[key] = canonicalise(value[key])
    return canonical
  }
  return value
}

/**
 * Canonical identity string for a `REQ` filter set. Two filter sets that select the same events —
 * differing only in object-key order, array-element order, or the order of the filters themselves —
 * produce the same string, so it is safe as a subscription dedup key. The output is a canonical
 * JSON string, not a digest; wrap it in `sha256Hex` if a fixed-length key is wanted.
 */
export const hashFilters = (filters: ReadonlyArray<NostrFilter>): string => JSON.stringify(canonicalise(filters))

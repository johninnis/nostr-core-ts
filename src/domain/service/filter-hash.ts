import { sha256 } from "@noble/hashes/sha2"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { isRecord } from "../value-object/guards.ts"
import { formatHex } from "../value-object/hex.ts"
import { textEncoder } from "../value-object/text-codec.ts"

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
 * Lowercase hex SHA-256 of a `REQ` filter set's canonical form. Two filter sets that select the
 * same events — differing only in object-key order, array-element order, or the order of the
 * filters themselves — produce the same digest, so it is safe as a fixed-length subscription dedup
 * key. Synchronous (uses the pure-JS SHA-256) so it can key a subscription map inline.
 */
export const hashFilters = (filters: ReadonlyArray<NostrFilter>): string =>
  formatHex(sha256(textEncoder.encode(JSON.stringify(canonicalise(filters)))))

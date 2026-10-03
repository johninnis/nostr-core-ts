import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { isRecord } from "./guards.ts"
import { sha256Hex } from "./sha256.ts"

// Deliberate: byte-identical to the PHP FilterHasher, hence the post-processed JSON.stringify — see ADR-0014
const encodeCanonical = (value: unknown): string =>
  JSON.stringify(value).replace(/[\u0080-\uffff]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)

const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonicalise)
      .map((element) => ({ element, key: encodeCanonical(element) }))
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

// Deliberate: a filter carrying a # key NIP-01 does not define is hashed like any other value — see ADR-0014
/**
 * Lowercase hex SHA-256 of a `REQ` filter set's canonical form: object keys and array elements sorted, the filters
 * included, and every non-ASCII UTF-16 code unit escaped as a lowercase `\uXXXX`. Filter sets that differ only in those
 * orders share a digest, so it keys a subscription for deduplication, and the digest equals the PHP `FilterHasher`'s
 * for the same filters. Synchronous.
 */
export const hashFilters = (filters: ReadonlyArray<NostrFilter>): string =>
  sha256Hex(encodeCanonical(canonicalise(filters)))

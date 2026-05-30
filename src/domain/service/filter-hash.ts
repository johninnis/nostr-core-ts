import { sha256 } from "@noble/hashes/sha2"
import type { NostrFilter } from "../value-object/nostr-filter.ts"
import { isRecord } from "../value-object/guards.ts"
import { formatHex } from "../value-object/hex.ts"
import { textEncoder } from "../value-object/text-codec.ts"

// Canonical encoding: JSON with every non-ASCII UTF-16 code unit escaped as a lowercase `\uXXXX`
// (so astral characters become surrogate pairs, matching PHP's `json_encode` without
// `JSON_UNESCAPED_UNICODE`). The result is pure ASCII, so bytewise sorting agrees across runtimes —
// this is what keeps the digest identical to the PHP `FilterHasher` for non-ASCII tag/search values.
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

/**
 * Lowercase hex SHA-256 of a `REQ` filter set's canonical form. Two filter sets that select the
 * same events — differing only in object-key order, array-element order, or the order of the
 * filters themselves — produce the same digest, so it is safe as a fixed-length subscription dedup
 * key. Synchronous (uses the pure-JS SHA-256) so it can key a subscription map inline.
 *
 * The canonical form is ASCII-safe JSON (non-ASCII escaped as `\uXXXX`), so the digest is identical
 * to the PHP `FilterHasher` for every input, including non-ASCII `search` strings and tag values.
 */
export const hashFilters = (filters: ReadonlyArray<NostrFilter>): string =>
  formatHex(sha256(textEncoder.encode(encodeCanonical(canonicalise(filters)))))

import type { Tag } from "../value-object/nostr-event.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { extractTagValues } from "./tags.ts"

const expiresAtOrBefore = (value: string, at: number): boolean => {
  const expiresAt = parseDecimalInteger(value)
  return expiresAt !== null && expiresAt <= at
}

// Deliberate: expired once ANY stated expiry has passed, so tag order never decides — see shared ADR-0011
/**
 * Whether `event` is expired at `at` (Unix seconds) under NIP-40: `true` once any of its `expiration` tags names a time
 * at or before `at`. A value that is not a decimal Unix timestamp is not an expiry and is ignored.
 */
export const isEventExpired = (event: { readonly tags: ReadonlyArray<Tag> }, at: number): boolean =>
  extractTagValues(event.tags, "expiration").some((value) => expiresAtOrBefore(value, at))
